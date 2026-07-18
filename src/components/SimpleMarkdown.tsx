import { useMemo, type ReactNode } from "react";
import {
  parseSimpleMarkdown,
  type SimpleMarkdownInline,
} from "../utils/simpleMarkdown";

type SimpleMarkdownProps = {
  content: string;
  className?: string;
};

function renderInlines(tokens: SimpleMarkdownInline[], keyPrefix: string) {
  return tokens.map<ReactNode>((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.type === "strong") return <strong key={key}>{token.text}</strong>;
    if (token.type === "code") return <code key={key}>{token.text}</code>;
    return <span key={key}>{token.text}</span>;
  });
}

function renderLines(lines: SimpleMarkdownInline[][], keyPrefix: string) {
  return lines.map((line, index) => (
    <span key={`${keyPrefix}-${index}`}>
      {index > 0 && <br />}
      {renderInlines(line, `${keyPrefix}-${index}`)}
    </span>
  ));
}

export function SimpleMarkdown({ content, className = "" }: SimpleMarkdownProps) {
  const blocks = useMemo(() => parseSimpleMarkdown(content), [content]);

  return (
    <div className={`simple-markdown ${className}`.trim()}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "heading") {
          return block.level === 1 ? (
            <h4 className="simple-markdown-heading is-level-1" key={key}>
              {renderInlines(block.inlines, key)}
            </h4>
            ) : block.level === 2 ? (
              <h5 className="simple-markdown-heading is-level-2" key={key}>
                {renderInlines(block.inlines, key)}
              </h5>
            ) : (
              <h6 className="simple-markdown-heading is-level-3" key={key}>
                {renderInlines(block.inlines, key)}
              </h6>
            );
        }
        if (block.type === "paragraph") {
          return <p key={key}>{renderLines(block.lines, key)}</p>;
        }
        if (block.type === "unordered-list") {
          return (
            <ul key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInlines(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ordered-list") {
          return (
            <ol key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInlines(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === "quote") {
          return <blockquote key={key}>{renderLines(block.lines, key)}</blockquote>;
        }
        return <hr key={key} />;
      })}
    </div>
  );
}
