"""The parallelogram lesson played through in a real browser: python3 tests/lesson.py [chromium|webkit] [WxH] [touch]

Serves the repo over HTTP and plays parts/lesson on its own page (?solo) from its Next tap to "Lesson complete", with
real taps and drags (Python Playwright: pip install playwright && playwright install chromium webkit):

  every screen     moves on by itself once its voice is done; a screen that asks waits for the answer
  each question    a wrong answer first (it must not move on, and must say why), then the right one
  the drag         B dragged until BC is parallel to AD (it snaps)
  the diagonals    drawn corner to corner, after a side was tried (a tip, no diagonal)
  answer boxes     a wrong value first, then the right ones
  the end          the score card counts the checks right on the first try
  the voice-over   every clip it fetched loaded, all from the player's language's recordings (assets/VO-HI/ with
                   TA_LAN=hi, assets/VO-MR/ with TA_LAN=mr) or, for a language not recorded, the English ones (parts/lesson/assets/vo/)

Checks there is no Back, Next or screen list, no console error or failed request, and that no screen stalls.
A screenshot of every screen goes to /tmp/parallelogram-lesson (or $TA_SHOTS). Clips play at ?speed=3.
In another language: TA_LAN=hi (or mr) python3 tests/lesson.py (?lan=hi).
"""
import functools
import http.server
import os
import sys
import threading
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(os.environ.get('TA_SHOTS', '/tmp/parallelogram-lesson'))
BROWSER = sys.argv[1] if len(sys.argv) > 1 else 'chromium'
SIZE = [int(v) for v in (sys.argv[2] if len(sys.argv) > 2 else '1280x720').split('x')]
TOUCH = len(sys.argv) > 3 and sys.argv[3] == 'touch'
LAN = os.environ.get('TA_LAN', '')

passed, failed = [], []


def check(ok, what, detail=''):
    (passed if ok else failed).append(what)
    print(('PASS ' if ok else 'FAIL ') + what + (('  [' + detail + ']') if detail and not ok else ''))


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    handler.log_message = lambda *a: None
    # (a deep queue: the page asks for many files at once, and the default 5 waiting connections refused some)
    srv = type('Server', (http.server.ThreadingHTTPServer,), {'request_queue_size': 128})(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/' % srv.server_address[1]


def launch(p, which):
    """The browser, or for WebKit the newest installed build if Playwright's own isn't there."""
    try:
        return getattr(p, which).launch()
    except Exception:
        if which != 'webkit':
            raise
        builds = sorted(Path.home().glob('Library/Caches/ms-playwright/webkit-*/pw_run.sh'))
        if not builds:
            raise
        return p.webkit.launch(executable_path=str(builds[-1]))


STATE = '''() => { const e = window.lessonDebug, s = e.state, st = e.cur();
  return { step: s.step, id: st.id, done: s.done, listen: !!s.listen, talking: !!s.talking, line: s.line, started: s.started,
           results: s.results, of: e.steps().length }; }'''
# the centre of an element in client px, or null
BOX = '''(sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect();
  return r.width || r.height ? [r.left + r.width / 2, r.top + r.height / 2] : null; }'''
# a board point (the shape's own coordinates) in client px
BOARD = '''([x, y]) => { const svg = document.querySelector('.stage svg[aria-label="' + I18n.t('ariaBoard') + '"]'); const pt = svg.createSVGPoint();
  pt.x = x; pt.y = y; const q = pt.matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; }'''


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    srv, url = serve()
    with sync_playwright() as p:
        browser = launch(p, BROWSER)
        ctx = browser.new_context(viewport={'width': SIZE[0], 'height': SIZE[1]}, has_touch=TOUCH, is_mobile=False)
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
        # (not the GPU driver's notices: screenshots read the WebGL water back)
        page.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') and 'GL Driver Message' not in m.text else None)
        page.on('requestfailed', lambda r: errs.append('failed: ' + r.url) if 'fonts.g' not in r.url and not r.url.endswith('.ogg') else None)
        clips = []  # every voice-over clip fetched: (address, status)
        page.on('response', lambda r: clips.append((r.url, r.status)) if r.url.split('?')[0].endswith('.ogg') else None)
        page.goto(url + 'parts/lesson/index.html?solo&debug&speed=3' + ('&lan=' + LAN if LAN else ''))
        page.wait_for_function('() => !!window.lessonDebug', timeout=20000)
        st = lambda: page.evaluate(STATE)
        box = lambda sel: page.evaluate(BOX, sel)
        board = lambda x, y: page.evaluate(BOARD, [x, y])

        def tap(sel):
            c = box(sel)
            if not c:
                raise RuntimeError('nothing to tap: ' + sel)
            if TOUCH:
                page.touchscreen.tap(c[0], c[1])
            else:
                page.mouse.click(c[0], c[1])
            time.sleep(0.25)

        def drag(a, b, steps=16):
            page.mouse.move(a[0], a[1]); page.mouse.down()
            page.mouse.move(b[0], b[1], steps=steps); page.mouse.up()
            time.sleep(0.3)

        def until(fn, ok, secs, what):
            t0 = time.time()
            while time.time() - t0 < secs:
                v = fn()
                if ok(v):
                    return v
                time.sleep(0.1)
            raise RuntimeError('timed out: ' + what)

        def asked():  # the question has been asked: its answers are up
            until(st, lambda s: not s['listen'] and not s['talking'], 30, 'the question to be asked')
            time.sleep(0.9)

        def wrong_then(sel_wrong, sel_right, what):
            asked()
            tap(sel_wrong)
            time.sleep(0.6)
            s = st()
            check(not s['done'], what + ': a wrong answer does not finish it')
            until(st, lambda s: not s['talking'], 20, 'the tip')
            for sel in ([sel_right] if isinstance(sel_right, str) else sel_right):
                tap(sel)
                time.sleep(0.5)
            check(st()['done'], what + ': the right answer finishes it')

        def pick(blank, value):  # the answer box opens its choices under it; the one that carries the value
            tap('[data-qa="blank-%s"]' % blank)
            time.sleep(0.35)
            if not box('[data-qa="ddopt-%s"]' % value):
                raise RuntimeError('no choice ' + value + ' in the menu')
            tap('[data-qa="ddopt-%s"]' % value)
            time.sleep(0.6)

        # ---- before the start: the lake and its Next; no Back, Next or screen list anywhere ----
        time.sleep(1.5)
        check(page.evaluate('() => document.querySelectorAll("[data-qa=nav-next],[data-qa=nav-back],[data-qa=screens],[data-qa=next],[data-qa=back]").length') == 0, 'no Back, Next or screen list')
        page.screenshot(path=str(SHOTS / '00-lake.png'))
        tap('[data-qa="start"]')
        until(st, lambda s: s['started'], 20, 'the opening and screen 1')
        done_ids, seen, stall_t0, last_step = set(), set(), time.time(), -1
        while True:
            s = st()
            if s['step'] != last_step:
                last_step, stall_t0 = s['step'], time.time()
            if s['id'] not in seen:
                seen.add(s['id'])
                time.sleep(1.2)
                page.screenshot(path=str(SHOTS / ('%02d-%s.png' % (s['step'] + 1, s['id']))))
                s = st()
            sid = s['id']
            if sid == 'recap' and sid not in done_ids:  # the summary: every idea explained in turn, then Next
                done_ids.add(sid)
                until(lambda: page.locator('[data-qa="sum-next"]').count(), lambda n: n > 0, 150, 'the summary: Next after every idea')
                time.sleep(0.6)
                check(page.evaluate('() => (document.querySelector(".sum-root") || {}).getAttribute("data-state")') == 'READY' and page.evaluate('() => document.querySelectorAll(".sum-root .summary-card").length') == 6,
                      'the summary: six ideas explained, their bubbles in the albums, Next up')
                tap('[data-qa="sum-next"]')
            if sid not in done_ids and not s['done']:
                done_ids.add(sid)
                if sid == 'askPar':
                    wrong_then('[data-qa="opt-AD"]', '[data-qa="opt-AB"]', 'Which pair is parallel')
                elif sid == 'dragPar':
                    until(st, lambda s: not s['listen'], 30, 'the drag instruction')
                    time.sleep(2.6)  # the demo hand
                    P = page.evaluate('() => lessonDebug.state.P')
                    tx = P['C']['x'] + (P['A']['x'] - P['D']['x'])
                    drag(board(P['B']['x'], P['B']['y']), board(P['B']['x'] + (tx - P['B']['x']) * 0.5, P['B']['y']))
                    check(not st()['done'], 'drag B: half way is not yet parallel')
                    until(st, lambda s: not s['talking'], 20, 'the drag tip')
                    P = page.evaluate('() => lessonDebug.state.P')
                    drag(board(P['B']['x'], P['B']['y']), board(tx + 4, P['B']['y']))
                    check(st()['done'], 'drag B: close to parallel snaps into a parallelogram')
                    check(page.evaluate('() => lessonDebug.isPg(lessonDebug.state.P)'), 'drag B: the shape is a parallelogram')
                elif sid == 'askSides':
                    wrong_then('[data-qa="opt-all"]', '[data-qa="opt-opp"]', 'What do you notice about the sides')
                elif sid == 'cp1a':
                    wrong_then('[data-qa="opt-B"]', ['[data-qa="opt-A"]', '[data-qa="opt-C"]'], 'Checkpoint 1a (select all)')
                elif sid == 'cp1b':
                    asked(); pick('CD', '14')
                    check(not st()['done'], 'Checkpoint 1b: a wrong value does not finish it')
                    until(st, lambda s: not s['talking'], 20, 'the tip'); time.sleep(0.6)
                    pick('CD', '7')
                    check(st()['done'], 'Checkpoint 1b: CD = 7 finishes it')
                elif sid == 'cp1c':
                    asked(); pick('CD', '13')  # a wrong CD gets CD's tip only, not AD's too
                    line = (st()['line'] or '').replace('\n', ' ')
                    check('CD is opposite AB' in line and 'AD' not in line, 'Checkpoint 1c: a wrong CD gets its own tip', line)
                    until(st, lambda s: not s['talking'], 20, 'the tip'); time.sleep(0.6)
                    pick('CD', '8'); pick('AD', '5')
                    check(st()['done'], 'Checkpoint 1c: CD = 8 and AD = 5 finish it')
                elif sid == 'tapEqA':
                    wrong_then('[data-qa="opt-B"]', '[data-qa="opt-C"]', 'Which angle is equal to ∠A')
                elif sid == 'tapEqD':
                    wrong_then('[data-qa="opt-A"]', '[data-qa="opt-B"]', 'Which angle is equal to ∠D')
                elif sid == 'askAdj':
                    wrong_then('[data-qa="opt-BD"]', ['[data-qa="opt-BC"]', '[data-qa="opt-AB"]'], 'Which other angles add to 180° (select all)')
                elif sid == 'cp2a':
                    wrong_then('[data-qa="opt-112"]', '[data-qa="opt-68"]', 'Checkpoint 2a')
                elif sid == 'cp2b':
                    wrong_then('[data-qa="opt-72"]', '[data-qa="opt-108"]', 'Checkpoint 2b')
                elif sid == 'cp2c':
                    asked(); pick('B', '65')  # a wrong value gets the tip about that value in that box
                    check('next to ∠A, not opposite it' in (st()['line'] or '').replace('\n', ' '), 'Checkpoint 2c: ∠B = 65° gets its own tip')
                    until(st, lambda s: not s['talking'], 20, 'the tip'); time.sleep(0.6)
                    pick('B', '115'); pick('C', '65'); pick('D', '115')
                    check(st()['done'], 'Checkpoint 2c: all three angles finish it')
                elif sid == 'drawDiag':
                    until(st, lambda s: not s['listen'], 30, 'the diagonal instruction'); time.sleep(2.6)
                    P = page.evaluate('() => lessonDebug.state.P')
                    pt = lambda k: board(P[k]['x'], P[k]['y'])
                    drag(pt('A'), pt('B'))  # a side: a tip, no diagonal
                    check(not page.evaluate('() => lessonDebug.state.diag.AC'), 'Draw the diagonals: a side is not a diagonal')
                    until(st, lambda s: not s['talking'], 20, 'the tip')
                    drag(pt('A'), pt('C')); drag(pt('B'), pt('D'))
                    time.sleep(0.6)
                    check(st()['done'], 'Draw the diagonals: AC and BD finish it')
                elif sid == 'matchSeg':
                    asked()
                    filled = lambda: page.evaluate('() => Object.keys(lessonDebug.state.fill.at).length')
                    tile = lambda t: box('[data-qa="tile-%d"]' % ['OA', 'OB', 'OC', 'OD'].index(t))
                    put = lambda t, b: drag(tile(t), box('[data-qa="blank-%s"]' % b))
                    tap('[data-qa="tile-0"]'); time.sleep(0.4)  # a segment is dragged into place: a tap is no answer
                    check(filled() == 0, 'Match the segments: a tap on a segment fills nothing')
                    put('OA', 'p1a'); put('OB', 'p1b'); time.sleep(0.6)  # a wrong pair is checked as soon as it is made
                    check(not st()['done'] and filled() == 2 and page.evaluate('() => Object.keys(lessonDebug.state.fill.bad).length') == 2, 'Match the segments: OA with OB is not a pair')
                    until(st, lambda s: not s['talking'], 20, 'the tip')  # meanwhile the wrong pair empties itself
                    until(filled, lambda n: n == 0, 5, 'the boxes to empty')
                    time.sleep(0.4)
                    put('OA', 'p1a'); put('OC', 'p1b'); time.sleep(0.7)  # a right pair stays, the next still to make
                    check(not st()['done'] and page.evaluate('() => Object.keys(lessonDebug.state.fill.locked).length') == 2, 'Match the segments: OA = OC stays, checked on its own')
                    put('OB', 'p2a'); put('OD', 'p2b'); time.sleep(0.8)
                    check(st()['done'], 'Match the segments: OA = OC and OB = OD finish it')
                elif sid == 'cp3a':
                    wrong_then('[data-qa="opt-12"]', '[data-qa="opt-6"]', 'Checkpoint 3a')
                elif sid == 'cp3b':
                    asked(); pick('OC', '5'); pick('OD', '3')
                    check(st()['done'], 'Checkpoint 3b: OC = 5 and OD = 3 finish it')
                elif sid == 'cp3c':
                    wrong_then('[data-qa="opt-aobo"]', ['[data-qa="opt-aooc"]', '[data-qa="opt-bood"]'], 'Checkpoint 3c (select all)')
                    check(page.locator('[data-qa="opt-bis"]').count() == 0, 'Checkpoint 3c: no fifth answer (bisecting is what the right answer shows)')
            if sid == 'end':
                until(st, lambda s: not s['talking'], 30, 'the goodbye')
                time.sleep(1.5)
                page.screenshot(path=str(SHOTS / ('%02d-end-card.png' % (s['step'] + 1))))
                score = page.evaluate('() => (document.querySelector(".stage") || {}).innerText || ""')
                right = sum(1 for v in st()['results'].values() if v)
                want = page.evaluate('(r) => I18n.t("lessonScore", { right: r, total: 9 })', right)
                check(want in score, 'the score card counts the checks right first time', score[:120])
                break
            if time.time() - stall_t0 > 45:
                check(False, 'screen %d (%s) moves on' % (s['step'] + 1, sid), 'stalled for 45 s')
                break
            time.sleep(0.2)
        check(len(seen) == st()['of'], 'every screen was played', '%d of %d' % (len(seen), st()['of']))
        check(not errs, 'no console errors or failed requests', '; '.join(errs[:5]))
        folder = page.evaluate('() => I18n.voiced ? "/assets/VO-" + I18n.lang.toUpperCase() + "/" : "/parts/lesson/assets/vo/"')
        odd = [u for u, s in clips if folder not in u or s >= 400]
        if page.evaluate('() => !!(window.VO && VO.on)'):
            check(clips and not odd, 'the voice-over: %d clips fetched, all from %s' % (len(clips), folder), '; '.join(odd[:3]) or 'no clip fetched')
        else:
            check(not clips, 'the voice-over is off in this browser (no Ogg Opus): no clip fetched', '; '.join(u for u, s in clips[:3]))
        browser.close()
    srv.shutdown()
    print('\n%d passed, %d failed. Screenshots: %s' % (len(passed), len(failed), SHOTS))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
