// Single importer of the vendored KaTeX stylesheet. Two independent `?url`
// imports of the same file make Vite emit two hashed copies — the one from
// markdown.ts was orphaned (no HTML referenced it), tripping the
// `css.length === 1` guard in katex.spec.ts. Routing both consumers through
// this re-export collapses them into one.
export { default as katexCssHref } from '../styles/katex.css?url';
