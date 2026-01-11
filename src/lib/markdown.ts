const stripInlineCode = (value: string) => value.replace(/`([^`]+)`/g, '$1');

export const stripMarkdown = (value: string): string => {
  if (!value) return '';

  let output = value;
  output = output.replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, ''));
  output = stripInlineCode(output);
  output = output.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  output = output.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  output = output.replace(/^#{1,6}\s+/gm, '');
  output = output.replace(/^>\s+/gm, '');
  output = output.replace(/^[-+*]\s+/gm, '');
  output = output.replace(/^\d+\.\s+/gm, '');
  output = output.replace(/\*\*([^*]+)\*\*/g, '$1');
  output = output.replace(/__([^_]+)__/g, '$1');
  output = output.replace(/\*([^*]+)\*/g, '$1');
  output = output.replace(/_([^_]+)_/g, '$1');
  output = output.replace(/~~([^~]+)~~/g, '$1');
  output = output.replace(/<[^>]*>/g, '');
  output = output.replace(/\s+/g, ' ').trim();
  return output;
};
