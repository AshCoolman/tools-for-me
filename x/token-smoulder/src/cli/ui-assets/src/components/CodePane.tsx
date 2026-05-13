import { useRef, useEffect, useCallback } from 'react';
import { EditorView, lineNumbers, highlightActiveLine, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle, Language, LanguageSupport, defineLanguageFacet } from '@codemirror/language';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { tags } from '@lezer/highlight';
import { parser as mdParser } from '@lezer/markdown';
import { parser as tsParser } from '@lezer/javascript';

type Props = {
  value: string;
  onChange?: (v: string) => void;
  language: 'markdown' | 'typescript';
  readOnly?: boolean;
};

const theme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--bg)',
    color: 'var(--fg)',
    fontFamily: 'var(--mono)',
    fontSize: '11.5px',
    lineHeight: '1.6',
    height: '100%',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg)',
    color: 'var(--fg-dim)',
    border: 'none',
    paddingRight: '4px',
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bg-3)' },
  '.cm-activeLine': { backgroundColor: 'var(--bg-3)' },
  '.cm-cursor': { borderLeftColor: 'var(--fg)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--bg-4) !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(0,122,204,0.3) !important' },
  '.cm-line': { padding: '0 4px' },
});

const highlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--kw)' },
  { tag: tags.string, color: 'var(--str)' },
  { tag: tags.heading, color: 'var(--hd)', fontWeight: '600' },
  { tag: tags.comment, color: 'var(--fg-dim)' },
  { tag: tags.typeName, color: 'var(--hd)' },
  { tag: tags.definition(tags.variableName), color: 'var(--chip)' },
  { tag: tags.propertyName, color: 'var(--chip)' },
  { tag: tags.number, color: 'var(--str)' },
  { tag: tags.bool, color: 'var(--kw)' },
  { tag: tags.operator, color: 'var(--fg)' },
  { tag: tags.punctuation, color: 'var(--fg-dim)' },
  { tag: tags.meta, color: 'var(--fg-dim)' },
  { tag: tags.link, color: 'var(--blue)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--blue)' },
]));

const mdLanguage = new Language(defineLanguageFacet(), mdParser);

const tsLanguage = new Language(defineLanguageFacet(), tsParser.configure({ dialect: 'ts' }));

function langExtension(lang: 'markdown' | 'typescript') {
  return lang === 'markdown' ? new LanguageSupport(mdLanguage) : new LanguageSupport(tsLanguage);
}

export function CodePane({ value, onChange, language, readOnly = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const createView = useCallback(() => {
    if (!containerRef.current) return;
    if (viewRef.current) { viewRef.current.destroy(); viewRef.current = null; }

    const updateListener = EditorView.updateListener.of(update => {
      if (update.docChanged && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        theme,
        highlight,
        lineNumbers(),
        highlightActiveLine(),
        langExtension(language),
        keymap.of([...defaultKeymap, indentWithTab]),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        updateListener,
      ],
    });

    viewRef.current = new EditorView({ state, parent: containerRef.current });
  }, []);

  useEffect(() => {
    createView();
    return () => { viewRef.current?.destroy(); viewRef.current = null; };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    createView();
  }, [language, readOnly]);

  return <div ref={containerRef} style={{ height: '100%', minHeight: 200 }} />;
}
