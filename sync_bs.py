#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 booksandspreadsheets.com 抓「订阅盒子的扣款规则 + 下一期书目」→ data/bs-subs.json

站点是 Wix CMS，页面服务端渲染，数据以 JSON 内嵌在 HTML 里。所以 urllib 抓 HTML 就够，
不需要浏览器/登录。三个坑（都踩过）：

1) 内嵌 JSON 的引号和斜杠是转义的（反斜杠+引号、反斜杠+斜杠），要先还原。
2) 内嵌 JSON **本身有瑕疵**：有的字段值被多包了一层引号，例如
   "notes":""Independent Bookstore specialising in Sci-Fi ...""，
   整段 json.loads 必然失败。所以只做大括号配对「定位区间」，字段再用正则取，绝不整体解析。
3) 数括号不能只看字符，必须跳过字符串内部（对象里嵌了富文本，字符串里就有花括号），
   否则配对全乱，匹配到的是 CMS 的字段定义而不是数据。
   数据是 "k":"值"，字段定义是 "k":{...}，用「冒号后是不是引号」即可区分。

只用标准库，方便直接在 GitHub Actions 的 ubuntu 上跑。
"""
import bisect
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

SITE = "https://www.booksandspreadsheets.com"

# 要同步的订阅页。想让别的订阅也能同步，把它的 slug 加进来即可
# （slug 就是 https://www.booksandspreadsheets.com/companies/<slug> 里那一段）
SOURCES = [
    "broken-binding",
    "broken-binding-sci-fi-%26-fantasy",
    "broken-binding-sci-fi",
    "broken-binding-fantasy",
    "bookish-%26-spice",
    "bookish-%26-spice-romantasy",
    "bookish-%26-spice-dark-romance",
    "bookish-%26-spice-contemporary-romance",
]

UA = ("book-tracker-sync/1.0 (personal read-only tracker; "
      "+https://github.com/michelleyws/Book-tracker)")
MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}

TAG_FIELDS = [
    ("hardcaseTags", "硬壳"), ("endpapersTags", "环衬"), ("edgesTags", "书口"),
    ("coverTags", "封面工艺"), ("authorSignatureTags", "签名"),
    ("interiorFormattingTags", "内页"), ("reverseDustJacketTags", "反向护封"),
    ("bonusContentTags", "加赠内容"), ("authorLetterTags", "作者信"),
    ("otherFeaturesTags", "其他"),
]


def get(url, tries=3):
    last = None
    for n in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:                      # noqa: BLE001  网络抖动就重试
            last = e
            time.sleep(5 * (n + 1))
    raise last


def deescape(html):
    """Wix 内嵌 JSON 的引号/斜杠是转义的，先还原"""
    return html.replace('\\"', '"').replace('\\/', '/')


def _spans(text):
    """一遍扫描，记录所有结构性大括号区间；跳过字符串内部（含转义）"""
    spans, stack = [], []
    in_str, esc = False, False
    for i, c in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            stack.append(i)
        elif c == "}" and stack:
            spans.append((stack.pop(), i))
    spans.sort()
    return spans


def spans_with(text, key):
    """所有「含该字段且字段值为字符串」的对象区间（= 数据对象，不是字段定义）"""
    spans = _spans(text)
    starts = [s for s, _ in spans]
    out = []
    for m in re.finditer(r'"' + re.escape(key) + r'"\s*:\s*"', text):
        p = m.start()
        k = bisect.bisect_right(starts, p) - 1
        hit, steps = None, 0
        while k >= 0 and steps < 4000:
            s, e = spans[k]
            if s <= p <= e:
                hit = (s, e)
                break
            k -= 1
            steps += 1
        if hit and hit not in out:
            out.append(hit)
    return out


def fld(sub, key, limit=400):
    m = re.search(r'"' + re.escape(key) + r'"\s*:\s*"((?:[^"\\]|\\.){0,' + str(limit) + r'})"', sub)
    if not m:
        return ""
    return m.group(1).replace('\\"', '"').replace("\\/", "/").strip()


def flist(sub, key, limit=600):
    m = re.search(r'"' + re.escape(key) + r'"\s*:\s*\[([^\]]{0,' + str(limit) + r'})\]', sub)
    if not m:
        return []
    return [x.replace('\\"', '"') for x in re.findall(r'"((?:[^"\\]|\\.){0,80})"', m.group(1))]


def wix_image(ref):
    """wix:image://v1/<id>~mv2.jpeg/<name>#w=.. → static.wixstatic.com 直链"""
    if not isinstance(ref, str):
        return ""
    m = re.match(r"wix:image://v1/([^/#]+)", ref)
    return "https://static.wixstatic.com/media/" + m.group(1) if m else ""


def gallery_first(sub):
    """media-gallery 字段里的第一张图（mainImage 拿不到时的兜底）"""
    m = re.search(r'"images"\s*:\s*\[\s*\{[^\[\]]{0,600}', sub)
    if not m:
        return ""
    for key in ("src",):
        mm = re.search(r'"' + key + r'"\s*:\s*"(wix:image://[^"]{1,220})"', m.group(0))
        if mm:
            return wix_image(mm.group(1))
    return ""


def parse_day(s):
    m = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)\b", s or "")
    if not m:
        return 0
    d = int(m.group(1))
    return d if 1 <= d <= 31 else 0


def parse_months(s):
    """'(Feb, Apr, June, Aug, Oct, Dec)' → [2,4,6,8,10,12]；没写月份=每月，返回 []"""
    if not s or "(" not in s:
        return []
    inner = s[s.index("(") + 1:s.rindex(")")] if ")" in s else ""
    out = []
    for w in re.findall(r"[A-Za-z]{3,}", inner):
        v = MONTHS.get(w[:3].lower())
        if v and v not in out:
            out.append(v)
    return sorted(out)


def period_of(month_name, year):
    v = MONTHS.get(month_name[:3].lower())
    return "%04d-%02d" % (int(year), v) if v else ""


def companies_on(raw):
    """页面上出现的所有公司数据（一页会嵌若干个「相关品牌」）"""
    out = []
    for sp in spans_with(raw, "subChart1Renews"):
        sub = raw[sp[0]:sp[1] + 1]
        for key in ("subChart1Renews", "sc1LastDayToSkip", "subChart1Cost", "subChart1Cycle",
                    "subChart1Ships", "shipsTo", "title", "link-companies-title"):
            break
        renews = fld(sub, "subChart1Renews")
        if not renews:
            continue                      # 只认有扣款规则的（数据对象）
        out.append({
            "name": fld(sub, "title"),
            "slug": (fld(sub, "link-companies-title").split("/companies/")[-1]),
            "renews": renews,
            "chargeDay": parse_day(renews),
            "chargeMonths": parse_months(renews),
            "skipDeadline": fld(sub, "sc1LastDayToSkip"),
            "skipExample": fld(sub, "sc1SkipExample"),
            "skipPolicy": fld(sub, "sc1SkipPolicy"),
            "cost": fld(sub, "subChart1Cost"),
            "cycle": fld(sub, "subChart1Cycle"),
            "ships": fld(sub, "subChart1Ships"),
            "shipsFrom": "; ".join(flist(sub, "newField1")) or fld(sub, "newField1"),
            "shipsTo": fld(sub, "shipsTo"),
            "website": fld(sub, "websiteUrl"),
            "note": fld(sub, "sc1AdditionalNotes"),
        })
    return out


def boxes_on(raw):
    """页面上出现的所有盒子期次（bookDate 必须是 '<Month> <Year> Box'）"""
    out = []
    for sp in spans_with(raw, "bookTitle"):
        sub = raw[sp[0]:sp[1] + 1]
        bd = fld(sub, "boxDate")
        m = re.match(r"^([A-Z][a-z]+)\s+(\d{4})\s+Box$", bd)
        title = fld(sub, "bookTitle")
        if not m or not title:
            continue
        design = []
        for key, label in TAG_FIELDS:
            vals = [v for v in flist(sub, key) if v and v != "N/A"]
            if vals:
                design.append(label + "：" + "、".join(vals))
        out.append({
            "period": period_of(m.group(1), m.group(2)),
            "boxLabel": bd,
            "company": fld(sub, "company"),
            "bookTitle": title,
            "featureType": fld(sub, "featureType"),
            # 注意：coverImage 是「封面工艺」那条图例的小图标（Features-9-Cover.png），不是书的图。
            # 真正的宣传图/盒子实物图在 mainImage（首发图），其次才是 media-gallery 里的第一张。
            "cover": wix_image(fld(sub, "mainImage")) or gallery_first(sub),
            "design": design,
            "editionUrl": (SITE + fld(sub, "link-special-editions-1-title"))
                          if fld(sub, "link-special-editions-1-title").startswith("/") else "",
        })
    out.sort(key=lambda x: (x["period"], x["bookTitle"]))
    return out


def main():
    companies, boxes, errors = {}, {}, []
    for slug in SOURCES:
        url = "%s/companies/%s" % (SITE, slug)
        try:
            raw = deescape(get(url))
            mine = None
            for c in companies_on(raw):
                if not c["slug"]:
                    continue
                companies.setdefault(c["slug"], c)
                if c["slug"] == slug:
                    mine = c
            n = 0
            for b in boxes_on(raw):
                boxes.setdefault(b["period"] + "|" + b["company"] + "|" + b["bookTitle"], b)
                n += 1
            print("OK  %-42s 公司=%s 扣款日=%-3s 月份=%-14s 本期书目=%d" % (
                slug, (mine or {}).get("name", "?")[:26],
                (mine or {}).get("chargeDay", 0), (mine or {}).get("chargeMonths", []), n),
                file=sys.stderr)
        except Exception as e:                           # noqa: BLE001
            errors.append({"slug": slug, "error": str(e)})
            print("ERR %-42s %s" % (slug, e), file=sys.stderr)
        time.sleep(2)                                     # 对站点友好

    clist = sorted(companies.values(), key=lambda c: c["name"])
    blist = sorted(boxes.values(), key=lambda b: (b["period"], b["company"]))
    for c in clist:                                       # 把书目挂到公司名下
        c["boxes"] = [b for b in blist if b["company"] == c["name"]]

    data = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": SITE,
        "note": "由 .github/workflows/sync-bs.yml 每日自动生成。数据来自 booksandspreadsheets.com；"
                "标 guessed 的书目是该站推测，仅供参考。",
        "companies": clist,
        "errors": errors,
    }
    # 输出到仓库根目录（GitHub Pages 直接能取到）。
    # 注意：脚本可能放在仓库根、也可能放在 tools/ 下，所以按「自己所在的目录」判断，
    # 不能写死成「上两级」——放到根目录时上两级就跑到仓库外面去了，Action 里会静默什么都不提交。
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here) if os.path.basename(here) in ("tools", "scripts", "bin") else here
    out = os.path.join(root, "bs-subs.json")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("写出 %s：%d 家公司，%d 个盒子，%d 个错误" % (out, len(clist), len(blist), len(errors)),
          file=sys.stderr)


if __name__ == "__main__":
    main()
