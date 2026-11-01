/**
 * 最小 `vscode` API 桩。
 *
 * 扩展的解析层（templateParser / tsSource / htmlSource）除了 Range / Position 之外
 * 只用到 `workspace.textDocuments`，因此可以在纯 Node 环境里直接跑，不需要
 * Extension Host。`npm test` 会先 tsc 到 dist，再跑这里的用例。
 */

const Module = require('module');

class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}

class Range {
    constructor(a, b, c, d) {
        if (typeof a === 'number') {
            this.start = new Position(a, b);
            this.end = new Position(c, d);
        } else {
            this.start = a;
            this.end = b;
        }
    }
}

class Uri {
    constructor(fsPath) {
        this.fsPath = fsPath;
        this.path = fsPath;
        this.scheme = 'file';
    }

    static file(fsPath) {
        return new Uri(fsPath);
    }

    toString() {
        return 'file://' + this.fsPath.replace(/\\/g, '/');
    }
}

class Location {
    constructor(uri, positionOrRange) {
        this.uri = uri;
        this.range = positionOrRange instanceof Range
            ? positionOrRange
            : new Range(positionOrRange, positionOrRange);
    }
}

const state = {
    textDocuments: [],
};

const vscode = {
    Position,
    Range,
    Uri,
    Location,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CompletionItemKind: { Method: 1, Property: 9, Variable: 5, Keyword: 13, Event: 22 },
    MarkdownString: class {
        constructor() {
            this.value = '';
        }
        appendCodeblock(code, language) {
            this.value += '```' + language + '\n' + code + '\n```\n';
            return this;
        }
        appendMarkdown(text) {
            this.value += text;
            return this;
        }
    },
    CompletionItem: class {
        constructor(label, kind) {
            this.label = label;
            this.kind = kind;
        }
    },
    SnippetString: class {
        constructor(value) {
            this.value = value;
        }
    },
    Hover: class {
        constructor(contents) {
            this.contents = contents;
        }
    },
    Diagnostic: class {
        constructor(range, message, severity) {
            this.range = range;
            this.message = message;
            this.severity = severity;
        }
    },
    languages: {
        createDiagnosticCollection: () => ({ set() {}, delete() {}, dispose() {} }),
        registerDefinitionProvider() {},
        registerHoverProvider() {},
        registerCompletionItemProvider() {},
    },
    window: {
        activeTextEditor: null,
        showInformationMessage() {},
        showTextDocument() {},
    },
    workspace: {
        get textDocuments() {
            return state.textDocuments;
        },
        onDidChangeTextDocument() {},
        onDidOpenTextDocument() {},
        onDidCloseTextDocument() {},
        onDidCreateFiles() {},
        onDidDeleteFiles() {},
        onDidRenameFiles() {},
    },
    commands: { registerCommand() {} },
};

let installed = false;

function installMock() {
    if (installed) return;
    installed = true;
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') return vscode;
        return originalLoad.apply(this, arguments);
    };
}

/** 模拟「这些文档正在编辑器里打开」（扩展会优先读内存内容） */
function setOpenDocuments(documents) {
    state.textDocuments = documents;
}

/** 构造一个够用的 TextDocument */
function makeDocument(filePath, text, languageId = 'html') {
    const lines = text.split('\n');
    return {
        fileName: filePath,
        uri: new Uri(filePath),
        languageId,
        version: 1,
        isClosed: false,
        getText: () => text,
        lineCount: lines.length,
        lineAt: line => ({ text: lines[line] ?? '' }),
        positionAt: offset => {
            let current = 0;
            for (let i = 0; i < lines.length; i++) {
                if (current + lines[i].length + 1 > offset) {
                    return new Position(i, offset - current);
                }
                current += lines[i].length + 1;
            }
            return new Position(lines.length - 1, 0);
        },
    };
}

module.exports = { installMock, setOpenDocuments, makeDocument, Position, Range, Uri };
