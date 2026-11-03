"""Scrape the Qudratullah 15-line Indo-Pak layout (610 pages) from QUL into data/pages.json.

Source: https://qul.tarteel.ai/mushaf_layouts/6  (Quranic Universal Library, Tarteel)
Output per page: list of 15 lines, each one of
  {"t": "s", "s": <surah>}                     surah header
  {"t": "b"}                                   bismillah
  {"t": "w", "c": 0|1, "w": [[loc, text]...]}  words ("c" = centred line)
"""
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path

BASE = "https://qul.tarteel.ai/mushaf_layouts/6?page_number={}"
OUT = Path(__file__).resolve().parent.parent / "data" / "pages.json"
PAGES = 610


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lines = {}
        self.cur = None
        self.word = None
        self.in_line = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if tag == "div" and "line-container" in cls.split():
            self.cur = {"n": int(a["data-line"]), "t": "w", "c": 0, "w": []}
            self.lines[self.cur["n"]] = self.cur
        elif self.cur is not None and tag == "div" and re.search(r"\bline\b", cls):
            if "line--surah-name" in cls:
                self.cur["t"] = "s"
            elif "line--bismillah" in cls:
                self.cur["t"] = "b"
            if "line--center" in cls:
                self.cur["c"] = 1
        elif self.cur is not None and tag == "span" and "data-location" in a:
            self.word = [a["data-location"], ""]
        elif self.cur is not None and tag == "span" and self.cur["t"] == "s":
            m = re.search(r"surah(\d{3})", " ".join(a.values()))
            if m:
                self.cur["s"] = int(m.group(1))

    def handle_data(self, data):
        if self.word is not None:
            self.word[1] += data
        elif self.cur is not None and self.cur["t"] == "s":
            m = re.search(r"surah(\d{3})", data)
            if m:
                self.cur["s"] = int(m.group(1))

    def handle_endtag(self, tag):
        if tag == "span" and self.word is not None:
            self.word[1] = self.word[1].strip()
            self.cur["w"].append(self.word)
            self.word = None


def fetch(n):
    for attempt in range(5):
        try:
            req = urllib.request.Request(BASE.format(n), headers={"User-Agent": "Mozilla/5.0"})
            html = urllib.request.urlopen(req, timeout=60).read().decode("utf8")
            p = PageParser()
            p.feed(html)
            lines = []
            for i in range(1, 16):
                ln = p.lines.get(i)
                if ln is None:
                    raise ValueError(f"page {n}: missing line {i}")
                if ln["t"] == "w":
                    lines.append({"t": "w", "c": ln["c"], "w": ln["w"]})
                elif ln["t"] == "s":
                    lines.append({"t": "s", "s": ln["s"]})
                else:
                    lines.append({"t": "b"})
            return n, lines
        except Exception as e:  # noqa: BLE001
            if attempt == 4:
                raise
            time.sleep(1 + attempt)


def main():
    OUT.parent.mkdir(exist_ok=True)
    only = [int(x) for x in sys.argv[1:]] or range(1, PAGES + 1)
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = dict(ex.map(fetch, only))
    if len(res) == PAGES:
        OUT.write_text(json.dumps([res[i] for i in range(1, PAGES + 1)], ensure_ascii=False, separators=(",", ":")), encoding="utf8")
        print("wrote", OUT, OUT.stat().st_size)
    else:
        print(json.dumps(res[min(res)], ensure_ascii=False, indent=1)[:3000])


if __name__ == "__main__":
    main()
