import React, { useMemo, useRef, useState } from 'react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const INLINE_CODE_CLASS =
  'bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono';
const LINK_CLASS = 'text-indigo-600 underline underline-offset-2';
const IMAGE_CLASS =
  'inline-flex items-center px-2 py-0.5 text-[11px] font-medium bg-gray-100 border border-gray-200 rounded';
const PARAGRAPH_CLASS = 'text-sm text-gray-700 leading-relaxed mb-3';
const UL_CLASS = 'list-disc pl-6 space-y-1 text-sm text-gray-700 mb-3';
const OL_CLASS = 'list-decimal pl-6 space-y-1 text-sm text-gray-700 mb-3';
const LI_CLASS = 'leading-relaxed';
const BLOCKQUOTE_CLASS = 'border-l-4 border-indigo-200 pl-4 italic text-gray-600 my-3';
const CODE_BLOCK_CLASS = 'bg-gray-900 text-gray-100 rounded-lg p-4 overflow-auto text-xs font-mono mb-3';
const HR_CLASS = 'my-4 border-gray-200';

const HEADING_CLASSES: Record<number, string> = {
  1: 'text-2xl font-semibold text-gray-900 mt-2 mb-3',
  2: 'text-xl font-semibold text-gray-900 mt-2 mb-3',
  3: 'text-lg font-semibold text-gray-900 mt-2 mb-2',
  4: 'text-base font-semibold text-gray-900 mt-2 mb-2',
  5: 'text-sm font-semibold text-gray-900 mt-2 mb-2 uppercase tracking-wide',
  6: 'text-xs font-semibold text-gray-900 mt-2 mb-2 uppercase tracking-wide',
};

const renderInline = (text: string) => {
  const codeSpans: string[] = [];
  let output = escapeHtml(text);

  output = output.replace(/`([^`]+)`/g, (_match, code) => {
    const index = codeSpans.length;
    codeSpans.push(code);
    return `{{CODE_${index}}}`;
  });

  output = output.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, alt) => {
    const label = alt ? alt : 'image';
    return `<span class="${IMAGE_CLASS}">${label}</span>`;
  });
  output = output.replace(/\[([^\]]+)\]\([^)]+\)/g, (_match, label) => {
    return `<span class="${LINK_CLASS}">${label}</span>`;
  });
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  output = output.replace(/_([^_]+)_/g, '<em>$1</em>');
  output = output.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  output = output.replace(/\{\{CODE_(\d+)\}\}/g, (_match, index) => {
    const code = codeSpans[Number(index)] ?? '';
    return `<code class="${INLINE_CODE_CLASS}">${code}</code>`;
  });

  return output;
};

const renderMarkdown = (markdown: string) => {
  if (!markdown.trim()) return '';

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inCodeBlock = false;
  let listType: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html += `<p class="${PARAGRAPH_CLASS}">${paragraph.join('<br />')}</p>`;
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) return;
    html += `</${listType}>`;
    listType = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushParagraph();
      closeList();
      if (inCodeBlock) {
        html += '</code></pre>';
        inCodeBlock = false;
      } else {
        html += `<pre class="${CODE_BLOCK_CLASS}"><code>`;
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      html += `${escapeHtml(line)}\n`;
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = Math.min(6, headingMatch[1].length);
      const headingClass = HEADING_CLASSES[level] || HEADING_CLASSES[3];
      html += `<h${level} class="${headingClass}">${renderInline(headingMatch[2])}</h${level}>`;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushParagraph();
      closeList();
      html += `<hr class="${HR_CLASS}" />`;
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      closeList();
      html += `<blockquote class="${BLOCKQUOTE_CLASS}">${renderInline(quoteMatch[1])}</blockquote>`;
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html += `<ol class="${OL_CLASS}">`;
      }
      html += `<li class="${LI_CLASS}">${renderInline(orderedMatch[1])}</li>`;
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-+*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html += `<ul class="${UL_CLASS}">`;
      }
      html += `<li class="${LI_CLASS}">${renderInline(unorderedMatch[1])}</li>`;
      continue;
    }

    closeList();
    paragraph.push(renderInline(line));
  }

  if (inCodeBlock) {
    html += '</code></pre>';
  }
  flushParagraph();
  closeList();
  return html;
};

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = 220,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewHtml = useMemo(() => renderMarkdown(value), [value]);

  const updateValue = (next: string, selectionStart?: number, selectionEnd?: number) => {
    onChange(next);
    if (!textareaRef.current) return;
    if (selectionStart === undefined || selectionEnd === undefined) return;
    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const wrapSelection = (prefix: string, suffix = prefix) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart ?? 0;
    const end = textareaRef.current.selectionEnd ?? 0;
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    const cursorStart = start + prefix.length;
    const cursorEnd = cursorStart + selected.length;
    updateValue(next, cursorStart, cursorEnd);
  };

  const applyLinePrefix = (prefix: string) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart ?? 0;
    const end = textareaRef.current.selectionEnd ?? 0;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = value.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const selection = value.slice(lineStart, lineEnd);
    const lines = selection.split('\n');
    const updated = lines
      .map((line) => (line.trim().length ? `${prefix}${line}` : line))
      .join('\n');
    const next = value.slice(0, lineStart) + updated + value.slice(lineEnd);
    updateValue(next, lineStart, lineStart + updated.length);
  };

  const applyLink = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart ?? 0;
    const end = textareaRef.current.selectionEnd ?? 0;
    const selected = value.slice(start, end) || 'link text';
    const linkPrefix = `[${selected}](`;
    const linkSuffix = ')';
    const urlPlaceholder = 'https://';
    const next = `${value.slice(0, start)}${linkPrefix}${urlPlaceholder}${linkSuffix}${value.slice(end)}`;
    const urlStart = start + linkPrefix.length;
    updateValue(next, urlStart, urlStart + urlPlaceholder.length);
  };

  const applyCode = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart ?? 0;
    const end = textareaRef.current.selectionEnd ?? 0;
    const selected = value.slice(start, end);
    if (selected.includes('\n')) {
      wrapSelection('\n```\n', '\n```\n');
    } else {
      wrapSelection('`', '`');
    }
  };

  const editorStyle = { minHeight };

  return (
    <div
      className={`flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white shadow-sm ${className ?? ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        {mode === 'write' ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => wrapSelection('**')}
              className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition"
            >
              Bold
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('*')}
              className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition"
            >
              Italic
            </button>
            <button
              type="button"
              onClick={() => applyLinePrefix('# ')}
              className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition"
            >
              Heading
            </button>
            <button
              type="button"
              onClick={() => applyLinePrefix('- ')}
              className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition"
            >
              List
            </button>
            <button
              type="button"
              onClick={() => applyLinePrefix('> ')}
              className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition"
            >
              Quote
            </button>
            <button
              type="button"
              onClick={applyLink}
              className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition"
            >
              Link
            </button>
            <button
              type="button"
              onClick={applyCode}
              className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition"
            >
              Code
            </button>
          </div>
        ) : (
          <div className="text-xs text-gray-500 font-medium">
            Markdown preview
          </div>
        )}

        <div className="inline-flex items-center rounded-full border border-gray-200 bg-white p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('write')}
            className={`px-3 py-1 rounded-full transition ${
              mode === 'write'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`px-3 py-1 rounded-full transition ${
              mode === 'preview'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === 'write' ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="flex-1 w-full px-4 py-3 focus:outline-none font-mono text-sm resize-none min-h-0"
          placeholder={placeholder}
          style={editorStyle}
        />
      ) : (
        <div
          className="flex-1 overflow-auto px-4 py-3 text-sm text-gray-800 min-h-0"
          style={editorStyle}
        >
          {previewHtml ? (
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <p className="text-sm text-gray-400">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
