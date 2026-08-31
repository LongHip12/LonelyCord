export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function highlightCode(code, lang = 'javascript') {
  const language = (lang || '').toLowerCase();

  const comments = [];
  let masked = code.replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|--[^\n]*)/g, (match) => {
    const placeholder = `__COMMENT_${comments.length}__`;
    comments.push(match);
    return placeholder;
  });

  const strings = [];
  masked = masked.replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, (match) => {
    const placeholder = `__STRING_${strings.length}__`;
    strings.push(match);
    return placeholder;
  });

  let out = escapeHtml(masked);

  const keywords = /\b(const|let|var|function|def|fn|pub|impl|struct|class|interface|type|enum|return|if|elif|else|for|while|loop|match|switch|case|break|continue|import|from|export|default|async|await|try|catch|except|finally|throw|raise|new|this|self|typeof|instanceof|void|yield|null|undefined|None|true|false|True|False|select|insert|update|delete|where|join|from|into|values|group|by|order|limit)\b/gi;
  out = out.replace(keywords, '<span style="color:#ff79c6;font-weight:700;">$&</span>');

  const types = /\b(int|float|double|char|string|str|bool|boolean|void|any|unknown|never|Promise|Array|Map|Set|Object|Number|String|Boolean|Function|List|Dict|Tuple|Option|Result|Vec)\b/g;
  out = out.replace(types, '<span style="color:#8be9fd;font-style:italic;">$&</span>');

  const functions = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/g;
  out = out.replace(functions, '<span style="color:#50fa7b;">$&</span>');

  const numbers = /\b(0x[0-9a-fA-F]+|\d+(\.\d+)?)\b/g;
  out = out.replace(numbers, '<span style="color:#bd93f9;">$&</span>');

  strings.forEach((str, idx) => {
    const safe = escapeHtml(str);
    out = out.replace(`__STRING_${idx}__`, `<span style="color:#f1fa8c;">${safe}</span>`);
  });

  comments.forEach((cmt, idx) => {
    const safe = escapeHtml(cmt);
    out = out.replace(`__COMMENT_${idx}__`, `<span style="color:#6272a4;font-style:italic;">${safe}</span>`);
  });

  return out;
}

export function parseMarkdown(text, options = { syntaxHighlight: true }) {
  if (!text) return '';

  const codeBlocks = [];
  let processed = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `%%CODE_BLOCK_${codeBlocks.length}%%`;
    codeBlocks.push({ lang: lang || 'code', code });
    return placeholder;
  });

  const inlineCodes = [];
  processed = processed.replace(/`([^`\n]+)`/g, (match, code) => {
    const placeholder = `%%INLINE_CODE_${inlineCodes.length}%%`;
    inlineCodes.push(code);
    return placeholder;
  });

  processed = escapeHtml(processed);

  processed = processed.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
  processed = processed.replace(/@([a-zA-Z0-9_-]{3,32})/g, '<span class="mention-tag" onclick="window.LonelyApp.openUserProfileByName(\'$1\')">@$1</span>');
  processed = processed.replace(/__([^_]+)__/g, '<u>$1</u>');
  processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  processed = processed.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  processed = processed.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  processed = processed.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  processed = processed.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  processed = processed.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
  processed = processed.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--text-link);text-decoration:underline;">$1</a>');

  processed = processed.replace(/\n/g, '<br/>');

  inlineCodes.forEach((code, idx) => {
    const safe = escapeHtml(code);
    processed = processed.replace(`%%INLINE_CODE_${idx}%%`, `<code class="inline">${safe}</code>`);
  });

  codeBlocks.forEach((block, idx) => {
    const formattedCode = options.syntaxHighlight !== false
      ? highlightCode(block.code, block.lang)
      : escapeHtml(block.code);
    const html = `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span>${escapeHtml(block.lang)}</span>
          <button class="btn-ghost btn-sm" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(block.code)}'));window.LonelyApp.showToast('Đã sao chép mã nguồn', 'info');">Copy</button>
        </div>
        <pre><code class="hljs language-${escapeHtml(block.lang)}">${formattedCode}</code></pre>
      </div>
    `;
    processed = processed.replace(`%%CODE_BLOCK_${idx}%%`, html);
  });

  return processed;
}
