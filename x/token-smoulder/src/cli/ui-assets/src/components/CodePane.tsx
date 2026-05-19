import { useRef, useEffect, useCallback } from 'react';
import { EditorView, lineNumbers, highlightActiveLine, keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
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
  wrap?: boolean;
};

function buildTheme(readOnly: boolean) {
  return EditorView.theme({
    '&': {
      backgroundColor: readOnly ? 'var(--bg)' : 'var(--bg-2)',
      color: 'var(--fg)',
      fontFamily: 'var(--mono)',
      fontSize: '11.5px',
      lineHeight: '1.6',
      height: '100%',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
    '.cm-gutters': {
      backgroundColor: readOnly ? 'var(--bg)' : 'var(--bg-2)',
      color: 'var(--fg-dim)',
      border: 'none',
      paddingRight: '4px',
    },
    '.cm-activeLineGutter': { backgroundColor: 'var(--bg-3)' },
    '.cm-activeLine': { backgroundColor: 'var(--bg-3)' },
    '.cm-cursor': {
      borderLeftColor: readOnly ? 'var(--fg-dim)' : 'var(--blue)',
      borderLeftWidth: readOnly ? '1px' : '2px',
    },
    '.cm-selectionBackground': { backgroundColor: 'var(--bg-4) !important' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(0,122,204,0.3) !important' },
    '.cm-line': { padding: '0 4px' },
  });
}

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

export function CodePane({ value, onChange, language, readOnly = false, wrap = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const wrapCompartmentRef = useRef<Compartment | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;
  const languageRef = useRef(language);
  languageRef.current = language;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const wrapRef = useRef(wrap);
  wrapRef.current = wrap;

  const createView = useCallback(() => {
    if (!containerRef.current) return;
    if (viewRef.current) { viewRef.current.destroy(); viewRef.current = null; }

    const updateListener = EditorView.updateListener.of(update => {
      if (update.docChanged && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const ro = readOnlyRef.current;
    const wrapCompartment = new Compartment();
    wrapCompartmentRef.current = wrapCompartment;

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        buildTheme(ro),
        highlight,
        lineNumbers(),
        highlightActiveLine(),
        langExtension(languageRef.current),
        wrapCompartment.of(wrapRef.current ? EditorView.lineWrapping : []),
        keymap.of([...defaultKeymap, indentWithTab]),
        EditorState.readOnly.of(ro),
        EditorView.editable.of(!ro),
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

  useEffect(() => {
    const view = viewRef.current;
    const compartment = wrapCompartmentRef.current;
    if (!view || !compartment) return;
    view.dispatch({
      effects: compartment.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap]);

  return <div ref={containerRef} style={{ height: '100%', minHeight: 200 }} />;
}
