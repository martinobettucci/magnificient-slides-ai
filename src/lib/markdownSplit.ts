export interface MarkdownHeadingPath {
  level: number;
  text: string;
}

export interface MarkdownSegment {
  content: string;
  headingLevel: number | null;
  headingText: string | null;
  startLine: number;
  endLine: number;
  parentHeadings: MarkdownHeadingPath[];
}

interface HeadingNode {
  level: number;
  headingText: string;
  startLine: number;
  endLine: number;
  children: HeadingNode[];
}

const isFenceLine = (line: string) => /^\s*```/.test(line);
const headingMatch = (line: string) => line.match(/^(#{1,6})\s+(.*)$/);

const sliceLines = (lines: string[], start: number, end: number) => {
  const content = lines.slice(start, end).join('\n');
  return end < lines.length ? `${content}\n` : content;
};

const buildHeadingTree = (lines: string[]): HeadingNode => {
  const root: HeadingNode = {
    level: 0,
    headingText: '',
    startLine: 0,
    endLine: lines.length,
    children: [],
  };

  const stack: HeadingNode[] = [root];
  let inFence = false;

  lines.forEach((line, index) => {
    if (isFenceLine(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const match = headingMatch(line);
    if (!match) return;

    const level = match[1].length;
    const headingText = match[2] ?? '';

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      const node = stack.pop();
      if (node) {
        node.endLine = index;
      }
    }

    const parent = stack[stack.length - 1] ?? root;
    const node: HeadingNode = {
      level,
      headingText,
      startLine: index,
      endLine: lines.length,
      children: [],
    };

    parent.children.push(node);
    stack.push(node);
  });

  return root;
};

const buildSegment = (
  lines: string[],
  start: number,
  end: number,
  node: HeadingNode | null,
  parentHeadings: MarkdownHeadingPath[],
): MarkdownSegment => ({
  content: sliceLines(lines, start, end),
  headingLevel: node ? node.level : null,
  headingText: node ? node.headingText : null,
  startLine: start + 1,
  endLine: end,
  parentHeadings,
});

const collectSegments = (
  node: HeadingNode,
  targetLevel: number,
  lines: string[],
  parentHeadings: MarkdownHeadingPath[],
): MarkdownSegment[] => {
  const segments: MarkdownSegment[] = [];
  const nodePath =
    node.level > 0
      ? [...parentHeadings, { level: node.level, text: node.headingText }]
      : parentHeadings;

  // If this node is at or deeper than the target, emit it as a whole (including its subtree)
  if (node.level >= targetLevel && node.level > 0) {
    segments.push(buildSegment(lines, node.startLine, node.endLine, node, parentHeadings));
    return segments;
  }

  const eligibleChildren = node.children.filter((child) => child.level <= targetLevel);

  // No eligible children: emit the full node (or root) as-is
  if (eligibleChildren.length === 0) {
    segments.push(
      buildSegment(lines, node.startLine, node.endLine, node.level > 0 ? node : null, parentHeadings),
    );
    return segments;
  }

  // Preamble (parent heading + content up to first child)
  let cursor = node.startLine;
  const firstChild = eligibleChildren[0];
  if (cursor < firstChild.startLine) {
    segments.push(
      buildSegment(lines, cursor, firstChild.startLine, node.level > 0 ? node : null, parentHeadings),
    );
  }

  // Children (recursively collected)
  eligibleChildren.forEach((child) => {
    segments.push(...collectSegments(child, targetLevel, lines, nodePath));
    cursor = child.endLine;
  });

  // Tail content after the last child stays with the parent
  if (cursor < node.endLine) {
    segments.push(
      buildSegment(lines, cursor, node.endLine, node.level > 0 ? node : null, parentHeadings),
    );
  }

  return segments;
};

export const splitMarkdown = (markdown: string, targetLevel: number): MarkdownSegment[] => {
  if (!markdown.trim()) return [];
  if (targetLevel < 1 || targetLevel > 6) {
    throw new Error(`Invalid target heading level: ${targetLevel}`);
  }

  const lines = markdown.split('\n');
  const tree = buildHeadingTree(lines);
  return collectSegments(tree, targetLevel, lines, []);
};
