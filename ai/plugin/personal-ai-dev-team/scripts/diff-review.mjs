#!/usr/bin/env node
/**
 * diff-review.mjs — git range를 side-by-side HTML diff로 렌더링한다.
 *
 * - diff 본문은 `git diff <range>` 실제 출력 그대로 사용한다(가공/기억 금지).
 * - 변경 사유(왜)는 --notes 사이드카(JSON: { "파일경로": "사유", "__summary__": "전체요약" })로 주입한다.
 * - 자체 완결 HTML(외부 의존 없음). 로컬 생성·로컬 열람 전용(외부 전송 아님).
 *
 * 사용:
 *   node diff-review.mjs --range <gitRange> [--notes notes.json] [--out out.html]
 *                        [--title "제목"] [--repo /path/to/repo]
 * 예:
 *   node diff-review.mjs --range 146b0e5..HEAD --notes notes.json --out docs/review/change.html
 */
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { args[key] = true; }
      else { args[key] = next; i++; }
    }
  }
  return args;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// unified diff 텍스트 → [{ oldPath, newPath, path, status, hunks: [{ header, rows }] }]
function parseDiff(text) {
  const files = [];
  const lines = text.split('\n');
  let cur = null;
  let hunk = null;
  let oldLn = 0, newLn = 0;
  let delBuf = [], addBuf = [];

  const flushPending = () => {
    if (!hunk) return;
    const n = Math.max(delBuf.length, addBuf.length);
    for (let i = 0; i < n; i++) {
      const d = delBuf[i];
      const a = addBuf[i];
      hunk.rows.push({
        type: d && a ? 'change' : d ? 'del' : 'add',
        oldNo: d ? d.no : '', left: d ? d.text : '',
        newNo: a ? a.no : '', right: a ? a.text : '',
      });
    }
    delBuf = []; addBuf = [];
  };

  const finishFile = () => { flushPending(); hunk = null; };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      finishFile();
      cur = { oldPath: '', newPath: '', path: '', status: 'modified', hunks: [] };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('new file mode')) { cur.status = 'added'; continue; }
    if (line.startsWith('deleted file mode')) { cur.status = 'deleted'; continue; }
    if (line.startsWith('rename ')) { cur.status = 'renamed'; continue; }
    if (line.startsWith('--- ')) {
      const p = line.slice(4).trim();
      cur.oldPath = p === '/dev/null' ? '' : p.replace(/^a\//, '');
      continue;
    }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      cur.newPath = p === '/dev/null' ? '' : p.replace(/^b\//, '');
      cur.path = cur.newPath || cur.oldPath;
      continue;
    }
    if (line.startsWith('@@')) {
      flushPending();
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldLn = m ? parseInt(m[1], 10) : 0;
      newLn = m ? parseInt(m[2], 10) : 0;
      hunk = { header: line, rows: [] };
      cur.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith('\\')) continue; // "\ No newline at end of file"
    const tag = line[0];
    const body = line.slice(1);
    if (tag === ' ') {
      flushPending();
      hunk.rows.push({ type: 'context', oldNo: oldLn, left: body, newNo: newLn, right: body });
      oldLn++; newLn++;
    } else if (tag === '-') {
      delBuf.push({ no: oldLn, text: body }); oldLn++;
    } else if (tag === '+') {
      addBuf.push({ no: newLn, text: body }); newLn++;
    }
  }
  finishFile();
  return files;
}

function statusBadge(status) {
  const map = { added: '#1a7f37', deleted: '#cf222e', renamed: '#9a6700', modified: '#0969da' };
  const label = { added: 'ADDED', deleted: 'DELETED', renamed: 'RENAMED', modified: 'MODIFIED' };
  const c = map[status] || '#57606a';
  return `<span class="badge" style="background:${c}">${label[status] || status.toUpperCase()}</span>`;
}

function renderRows(rows) {
  let html = '';
  for (const r of rows) {
    if (r.type === 'context') {
      html += `<tr class="ctx"><td class="ln">${r.oldNo}</td><td class="code">${esc(r.left)}</td>`
            + `<td class="ln">${r.newNo}</td><td class="code">${esc(r.right)}</td></tr>`;
    } else {
      const leftCls = r.left !== '' || r.type !== 'add' ? (r.type === 'add' ? 'empty' : 'del') : 'empty';
      const rightCls = r.right !== '' || r.type !== 'del' ? (r.type === 'del' ? 'empty' : 'add') : 'empty';
      html += `<tr class="chg">`
            + `<td class="ln">${r.oldNo}</td><td class="code ${leftCls}">${r.left === '' ? '' : esc(r.left)}</td>`
            + `<td class="ln">${r.newNo}</td><td class="code ${rightCls}">${r.right === '' ? '' : esc(r.right)}</td>`
            + `</tr>`;
    }
  }
  return html;
}

function noteHtml(note) {
  if (!note) return '';
  return `<div class="why"><div class="why-h">왜 이렇게 바꿨나</div>`
       + `<div class="why-b">${esc(note).replace(/\n/g, '<br>')}</div></div>`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const range = args.range;
  if (!range) { console.error('ERROR: --range <gitRange> 필수'); process.exit(1); }
  const cwd = args.repo ? resolve(args.repo) : process.cwd();
  const title = args.title || `Diff Review: ${range}`;
  const out = args.out || 'diff-review.html';

  let notes = {};
  if (args.notes && existsSync(args.notes)) {
    try { notes = JSON.parse(readFileSync(args.notes, 'utf8')); }
    catch (e) { console.error('WARN: notes JSON 파싱 실패 — 무시함:', e.message); }
  }

  const diffText = execSync(`git diff ${range}`, { cwd, maxBuffer: 64 * 1024 * 1024 }).toString();
  const stat = execSync(`git diff --stat ${range}`, { cwd, maxBuffer: 16 * 1024 * 1024 }).toString().trim();
  const files = parseDiff(diffText);

  let body = '';
  if (notes.__summary__) {
    body += `<div class="summary"><div class="why-h">변경 요약</div><div class="why-b">${esc(notes.__summary__).replace(/\n/g, '<br>')}</div></div>`;
  }
  body += `<pre class="stat">${esc(stat)}</pre>`;

  if (files.length === 0) {
    body += `<p class="muted">변경 없음(빈 diff).</p>`;
  }
  for (const f of files) {
    body += `<section class="file"><h2>${statusBadge(f.status)} <code>${esc(f.path)}</code></h2>`;
    body += noteHtml(notes[f.path]);
    body += `<table class="diff"><thead><tr><th></th><th>원본</th><th></th><th>변경</th></tr></thead><tbody>`;
    for (const h of f.hunks) {
      body += `<tr class="hunk"><td colspan="4">${esc(h.header)}</td></tr>`;
      body += renderRows(h.rows);
    }
    body += `</tbody></table></section>`;
  }

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{margin:0;background:#f6f8fa;color:#1f2328}
header{position:sticky;top:0;background:#24292f;color:#fff;padding:12px 20px;z-index:5}
header h1{font-size:16px;margin:0}
header .sub{font-size:12px;color:#b1bac4;margin-top:2px}
main{max-width:1500px;margin:0 auto;padding:20px}
.summary,.why{border-radius:6px;margin:10px 0;border:1px solid #d0d7de;background:#fff}
.summary{border-left:4px solid #0969da}
.why{border-left:4px solid #9a6700;background:#fff8e6}
.why-h{font-weight:600;font-size:12px;padding:8px 12px 0}
.why-b{padding:6px 12px 10px;font-size:13px;line-height:1.55;white-space:normal}
.stat{background:#fff;border:1px solid #d0d7de;border-radius:6px;padding:12px;overflow:auto;font-size:12px;color:#57606a}
.file{margin:22px 0;background:#fff;border:1px solid #d0d7de;border-radius:6px;overflow:hidden}
.file h2{font-size:14px;margin:0;padding:10px 14px;background:#f6f8fa;border-bottom:1px solid #d0d7de}
.file h2 code{font-size:13px}
.badge{color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;vertical-align:middle}
table.diff{width:100%;border-collapse:collapse;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
table.diff th{font-size:11px;color:#57606a;text-align:left;padding:4px 10px;border-bottom:1px solid #d0d7de;background:#f6f8fa}
.ln{width:1%;min-width:34px;text-align:right;color:#8c959f;padding:0 8px;user-select:none;border-right:1px solid #eaeef2;vertical-align:top}
.code{padding:0 10px;white-space:pre-wrap;word-break:break-word;vertical-align:top}
tr.hunk td{background:#eef4ff;color:#57606a;padding:3px 10px;font-size:11px}
.del{background:#ffebe9}
.add{background:#e6ffec}
.empty{background:#f6f8fa}
.muted{color:#8c959f}
</style></head>
<body>
<header><h1>${esc(title)}</h1><div class="sub">range: ${esc(range)} · 좌=원본 / 우=변경 · 로컬 전용</div></header>
<main>${body}</main>
</body></html>`;

  const outPath = resolve(cwd, out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  console.log(`OK: ${outPath} (files=${files.length})`);
}

main();
