// ===== AI 圆桌模拟器 — 流式 JSON 解析器 =====
// 字符级状态机，实时提取 public.speech 字段，不等待完整 JSON 到达
// 支持转义字符、markdown 代码块围栏、跨 chunk 边界

import type { CharacterOutput } from './types.js';

export interface StreamParseResult {
  /** 提取到的 speech 文本（实时累积，每次 feedChunk 后更新） */
  speechBuffer: string;
  /** 是否已接收到完整 JSON */
  isComplete: boolean;
  /** 完整解析后的对象（仅在 isComplete=true 时有值） */
  fullJson?: CharacterOutput;
  /** 解析错误信息 */
  error?: string;
}

export class StreamingJsonParser {
  private buffer: string = '';
  private speechChars: string[] = [];
  private parsedFullJson: CharacterOutput | null = null;
  private complete: boolean = false;
  private parseError: string | null = null;

  // 字符级状态机
  private depth: number = 0;                    // JSON 嵌套深度
  private inSpeechValue: boolean = false;       // 当前是否在 public.speech 的字符串值内
  private currentKey: string = '';              // 当前正在解析的 key
  private path: string[] = [];                  // 当前路径栈
  private expectKey: boolean = true;            // 期待 key 还是 value
  private inString: boolean = false;            // 当前是否在字符串值内
  private escapeNext: boolean = false;          // 下一个字符是否转义
  private capturedKey: boolean = false;         // 刚捕获了一个 key
  private skipToTopLevel: boolean = false;      // 跳过顶层非 JSON 内容

  /** 接收新 chunk 并增量解析，返回当前累积结果 */
  feedChunk(chunk: string): StreamParseResult {
    if (this.complete) return this.getResult();

    // 累积完整 buffer 用于最终 JSON.parse
    this.buffer += chunk;

    for (const ch of chunk) {
      this.processChar(ch);
    }

    return this.getResult();
  }

  /** 获取当前解析结果 */
  getResult(): StreamParseResult {
    const result: StreamParseResult = {
      speechBuffer: this.speechChars.join(''),
      isComplete: this.complete,
    };

    if (this.complete && this.parsedFullJson) {
      result.fullJson = this.parsedFullJson;
    }

    if (this.parseError) {
      result.error = this.parseError;
    }

    return result;
  }

  /** 重置解析器状态 */
  reset(): void {
    this.buffer = '';
    this.speechChars = [];
    this.parsedFullJson = null;
    this.complete = false;
    this.parseError = null;
    this.depth = 0;
    this.inSpeechValue = false;
    this.currentKey = '';
    this.path = [];
    this.expectKey = true;
    this.inString = false;
    this.escapeNext = false;
    this.capturedKey = false;
    this.skipToTopLevel = true;
  }

  /** 存根返回包 */
  private getTmpResult(): StreamParseResult {
    return {
      speechBuffer: this.speechChars.join(''),
      isComplete: this.complete,
    };
  }

  private processChar(ch: string): void {
    // 如果已经完成了，跳过
    if (this.complete) return;

    // 跳过顶层非 JSON 内容（markdown 代码块围栏等）
    if (this.skipToTopLevel) {
      if (ch === '{') {
        this.skipToTopLevel = false;
        this.depth = 1;
        this.expectKey = true;
      }
      return;
    }

    // 处理转义字符
    if (this.escapeNext) {
      this.escapeNext = false;
      if (this.inSpeechValue) {
        this.speechChars.push(ch);
      }
      return;
    }

    if (ch === '\\' && this.inString) {
      this.escapeNext = true;
      return;
    }

    // 字符串内处理（key 或 value）
    if (this.inString) {
      if (ch === '"') {
        this.inString = false;
        // 如果刚捕获了一个 key，且是 speech 路径上的 key
        if (this.capturedKey) {
          this.capturedKey = false;
          this.path.push(this.currentKey);

          // 检查路径是否为 ["public", "speech"]
          if (
            this.path.length === 2 &&
            this.path[0] === 'public' &&
            this.path[1] === 'speech'
          ) {
            // 期待接下来的冒号和字符串值
            // 实际开启 inSpeechValue 在冒号后的字符串开头时
          }
        }
      } else {
        // 累积 key 字符
        if (this.capturedKey) {
          this.currentKey += ch;
        }
      }
      return;
    }

    // 处理结构字符
    switch (ch) {
      case '"':
        this.inString = true;
        if (this.expectKey) {
          // 开始一个 key
          this.capturedKey = true;
          this.currentKey = '';
        } else {
          // 开始一个字符串 value
          // 检查路径是否为 ["public", "speech"]
          if (
            this.path.length >= 2 &&
            this.path[this.path.length - 2] === 'public' &&
            this.path[this.path.length - 1] === 'speech'
          ) {
            this.inSpeechValue = true;
          }
        }
        break;

      case ':':
        this.expectKey = false;
        break;

      case ',':
        this.expectKey = true;
        // 退出 speech value
        if (this.inSpeechValue) {
          this.inSpeechValue = false;
          this.path.pop(); // pop speech
        }
        break;

      case '{':
        this.depth++;
        if (!this.expectKey) {
          // 进入嵌套对象
          this.path.push('');  // placeholder, 会被后面 key 替换
        }
        this.expectKey = true;
        break;

      case '}':
        this.depth--;
        if (this.depth <= 0) {
          // JSON 闭合完毕
          this.complete = true;
          this.inSpeechValue = false;
          try {
            this.parsedFullJson = JSON.parse(this.buffer) as CharacterOutput;
          } catch {
            // buffer 可能含多余字符，尝试提取第一个 JSON 对象
            this.parseError = 'buffer parse failed, attempting recovery';
            const match = this.buffer.match(/\{[\s\S]*\}/);
            if (match) {
              try {
                this.parsedFullJson = JSON.parse(match[0]) as CharacterOutput;
              } catch {
                this.parseError = 'recovery parse failed';
              }
            }
          }
        }
        // 弹出路径
        if (this.path.length > 0 && !this.inSpeechValue) {
          this.path.pop();
        }
        if (this.inSpeechValue) {
          this.inSpeechValue = false;
          this.path.pop(); // pop speech
        }
        this.expectKey = false;
        break;

      case '[':
        this.depth++;
        this.expectKey = false;
        break;

      case ']':
        this.depth--;
        break;

      case ' ':
      case '\n':
      case '\r':
      case '\t':
        // whitespace 只在 speech 值内部累积
        if (this.inSpeechValue && this.path.length >= 2) {
          this.speechChars.push(ch);
        }
        break;

      default:
        // 非结构化字符：在 speech 值内部时累积
        if (this.inSpeechValue && this.path.length >= 2) {
          this.speechChars.push(ch);
        }
        break;
    }
  }
}
