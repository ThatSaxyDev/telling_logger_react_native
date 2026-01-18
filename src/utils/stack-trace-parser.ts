/**
 * Stack trace parsing utilities for JavaScript/React Native.
 * Parses Error stack traces into structured elements for crash grouping.
 */

export interface StackFrame {
  file: string;
  line: string;
  column?: string;
  method: string;
  className?: string;
}

/**
 * Parses a JavaScript Error stack trace into structured StackFrame elements.
 */
export function parseStackTrace(stack: string | undefined): StackFrame[] {
  if (!stack) return [];

  const frames: StackFrame[] = [];
  const lines = stack.split('\n');

  // Common stack trace patterns:
  // Chrome/V8: "    at functionName (file:line:column)"
  // Chrome/V8 anonymous: "    at file:line:column"
  // React Native: "    at functionName (file:line:column)"
  // React Native Hermes: "    at functionName (file:line:column)"

  const chromePattern = /^\s*at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/;
  const chromeAnonymousPattern = /^\s*at\s+(.+?):(\d+):(\d+)$/;
  const hermesByteCodePattern = /^\s*at\s+(.+?)\s+\(address at\s+.+?\)$/;

  for (const line of lines) {
    // Skip the first line (error message)
    if (line.startsWith('Error:') || line.startsWith('TypeError:') || line.startsWith('ReferenceError:')) {
      continue;
    }

    let match = chromePattern.exec(line);
    if (match) {
      const fullMethod = match[1];
      const file = match[2];
      const lineNum = match[3];
      const column = match[4];

      // Parse class.method into separate fields
      const { className, methodName } = parseMethodName(fullMethod);

      frames.push({
        file,
        line: lineNum,
        column,
        method: methodName,
        className,
      });
      continue;
    }

    // Anonymous function pattern
    match = chromeAnonymousPattern.exec(line);
    if (match) {
      frames.push({
        file: match[1],
        line: match[2],
        column: match[3],
        method: '<anonymous>',
      });
      continue;
    }

    // Hermes bytecode pattern (less useful, but capture it)
    match = hermesByteCodePattern.exec(line);
    if (match) {
      frames.push({
        file: '',
        line: '0',
        method: match[1],
      });
      continue;
    }
  }

  return frames;
}

/**
 * Parse method name into class and method components.
 */
function parseMethodName(fullMethod: string): { className?: string; methodName: string } {
  // Handle patterns like:
  // "Object.functionName" -> class: Object, method: functionName
  // "ClassName.prototype.method" -> class: ClassName, method: method
  // "functionName" -> no class, method: functionName
  // "new ClassName" -> class: ClassName, method: constructor

  if (fullMethod.startsWith('new ')) {
    return {
      className: fullMethod.substring(4),
      methodName: 'constructor',
    };
  }

  // Remove .prototype if present
  const cleaned = fullMethod.replace('.prototype', '');

  const lastDotIndex = cleaned.lastIndexOf('.');
  if (lastDotIndex > 0) {
    return {
      className: cleaned.substring(0, lastDotIndex),
      methodName: cleaned.substring(lastDotIndex + 1),
    };
  }

  return { methodName: cleaned };
}

/**
 * Converts a list of StackFrame to JSON-serializable format matching LogEvent.stackTraceElements.
 */
export function stackFramesToJson(frames: StackFrame[]): Array<{ file: string; line: string; method: string; column?: string; class?: string }> {
  return frames.map((frame) => {
    const result: { file: string; line: string; method: string; column?: string; class?: string } = {
      file: frame.file,
      line: frame.line,
      method: frame.method,
    };
    if (frame.column) result.column = frame.column;
    if (frame.className) result.class = frame.className;
    return result;
  });
}
