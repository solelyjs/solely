import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const SOLELY_CONTROL_TAGS = new Set(['if', 'elseif', 'else', 'for']);

export type ReferenceKind = 'method' | 'dataProp' | 'ref' | 'chainedMethod' | 'dataKeyword';

export interface TemplateReference {
    kind: ReferenceKind;
    name: string;
    range: vscode.Range;
    fullExpression: string;
}

export interface TemplateDiagnostic {
    message: string;
    range: vscode.Range;
    severity: vscode.DiagnosticSeverity;
}

export interface MethodSignature {
    name: string;
    signature: string;
    range: vscode.Range;
}

export function findCorrespondingTsFile(htmlPath: string): string | null {
    const dir = path.dirname(htmlPath);
    const htmlBaseName = path.basename(htmlPath);

    if (!fs.existsSync(dir)) {
        return null;
    }

    const entries = fs.readdirSync(dir);
    const tsFiles = entries.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

    for (const tsFile of tsFiles) {
        const tsPath = path.join(dir, tsFile);
        try {
            const content = fs.readFileSync(tsPath, 'utf-8');
            if (isTemplateImport(content, htmlBaseName)) {
                return tsPath;
            }
        } catch {
            continue;
        }
    }

    const sameNameTs = path.join(dir, path.basename(htmlPath, '.html') + '.ts');
    if (fs.existsSync(sameNameTs)) {
        return sameNameTs;
    }

    return null;
}

function isTemplateImport(tsContent: string, htmlBaseName: string): boolean {
    const escaped = escapeRegex(htmlBaseName);
    const pattern = new RegExp(
        `import\\s+(?:\\{[^}]*\\}|\\w+|\\w+\\s*,\\s*\\{[^}]*\\})\\s+from\\s+['"]\\.?\\/?${escaped}\\?(solely|raw)['"]`,
    );
    return pattern.test(tsContent);
}

export function findCorrespondingHtmlFile(tsPath: string): string | null {
    try {
        const content = fs.readFileSync(tsPath, 'utf-8');
        const match = content.match(
            /import\s+(?:\{[^}]*\}|\w+|\w+\s*,\s*\{[^}]*\})\s+from\s+['"]\.?\/?([\w./-]+\.html)\?(solely|raw)['"]/,
        );
        if (match) {
            const dir = path.dirname(tsPath);
            const htmlPath = path.resolve(dir, match[1]);
            if (fs.existsSync(htmlPath)) {
                return htmlPath;
            }
        }
    } catch {
        // ignore
    }
    return null;
}

export function extractReferenceAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
): TemplateReference | null {
    const line = document.lineAt(position.line).text;
    const charIndex = position.character;

    const ref = extractDataPropAtPosition(line, position.line, charIndex);
    if (ref) return ref;

    const dataKw = extractDataKeywordAtPosition(line, position.line, charIndex);
    if (dataKw) return dataKw;

    const refAttr = extractRefAtPosition(line, position.line, charIndex);
    if (refAttr) return refAttr;

    const chained = extractChainedMethodAtPosition(line, position.line, charIndex);
    if (chained) return chained;

    const method = extractMethodCallAtPosition(line, position.line, charIndex);
    if (method) return method;

    return null;
}

function extractMethodCallAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    const regex = /\bthis\.(\w+)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const startChar = match.index + match[0].indexOf(match[1]);
        const endChar = startChar + match[1].length;

        if (charIndex >= startChar && charIndex <= endChar) {
            return {
                kind: 'method',
                name: match[1],
                range: new vscode.Range(lineNum, startChar, lineNum, endChar),
                fullExpression: match[0],
            };
        }
    }

    return null;
}

function extractDataPropAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    const regex = /\$data\.(\w+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const startChar = match.index + '$data.'.length;
        const endChar = startChar + match[1].length;

        if (charIndex >= startChar && charIndex <= endChar) {
            return {
                kind: 'dataProp',
                name: match[1],
                range: new vscode.Range(lineNum, startChar, lineNum, endChar),
                fullExpression: match[0],
            };
        }
    }

    return null;
}

function extractDataKeywordAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    const regex = /\$data\b/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const startChar = match.index;
        const endChar = startChar + 5;

        if (charIndex >= startChar && charIndex <= endChar) {
            return {
                kind: 'dataKeyword',
                name: '$data',
                range: new vscode.Range(lineNum, startChar, lineNum, endChar),
                fullExpression: '$data',
            };
        }
    }

    return null;
}

function extractRefAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    const regex = /\bref\s*=\s*"(\w+)"/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const valueStart = line.indexOf('"', match.index) + 1;
        const startChar = valueStart;
        const endChar = valueStart + match[1].length;

        if (charIndex >= startChar && charIndex <= endChar) {
            return {
                kind: 'ref',
                name: match[1],
                range: new vscode.Range(lineNum, startChar, lineNum, endChar),
                fullExpression: match[0],
            };
        }
    }

    return null;
}

function extractChainedMethodAtPosition(line: string, lineNum: number, charIndex: number): TemplateReference | null {
    const regex = /\bthis\.(\w+)\.(\w+)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        const firstStart = match.index + 'this.'.length;
        const firstEnd = firstStart + match[1].length;
        const secondStart = firstEnd + 1;
        const secondEnd = secondStart + match[2].length;

        if (charIndex >= firstStart && charIndex <= firstEnd) {
            return {
                kind: 'chainedMethod',
                name: match[1],
                range: new vscode.Range(lineNum, firstStart, lineNum, firstEnd),
                fullExpression: match[0],
            };
        }

        if (charIndex >= secondStart && charIndex <= secondEnd) {
            return {
                kind: 'chainedMethod',
                name: match[1],
                range: new vscode.Range(lineNum, secondStart, lineNum, secondEnd),
                fullExpression: match[0],
            };
        }
    }

    return null;
}

export function findDefinitionInTsFile(tsPath: string, ref: TemplateReference): vscode.Location | null {
    if (!fs.existsSync(tsPath)) {
        return null;
    }

    switch (ref.kind) {
        case 'method':
        case 'chainedMethod':
            return findMethodInTsFile(tsPath, ref.name);
        case 'dataProp':
            return findPropInTsFile(tsPath, ref.name);
        case 'dataKeyword':
            return findDataDefinitionInTsFile(tsPath);
        case 'ref':
            return findRefInTsFile(tsPath, ref.name);
        default:
            return null;
    }
}

function findMethodInTsFile(tsPath: string, methodName: string): vscode.Location | null {
    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');

    const escaped = escapeRegex(methodName);
    const patterns = [
        new RegExp(`^\\s*(async\\s+)?${escaped}\\s*\\(`),
        new RegExp(`^\\s*(public\\s+|private\\s+|protected\\s+)?(static\\s+)?(async\\s+)?${escaped}\\s*\\(`),
        new RegExp(`^\\s*(get\\s+|set\\s+)?${escaped}\\s*\\(`),
        new RegExp(`^\\s*(public\\s+|private\\s+|protected\\s+)?(static\\s+)?(async\\s+)?${escaped}\\s*[=:(]`),
    ];

    for (let i = 0; i < lines.length; i++) {
        for (const pattern of patterns) {
            if (pattern.test(lines[i])) {
                const methodIdx = lines[i].indexOf(methodName);
                const pos = new vscode.Position(i, methodIdx >= 0 ? methodIdx : 0);
                return new vscode.Location(vscode.Uri.file(tsPath), pos);
            }
        }
    }

    return null;
}

function findPropInTsFile(tsPath: string, propName: string): vscode.Location | null {
    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');
    const escaped = escapeRegex(propName);

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`name: '${propName}'`) || lines[i].includes(`name: "${propName}"`)) {
            const idx = lines[i].indexOf(`'${propName}'`);
            const finalIdx = idx >= 0 ? idx : lines[i].indexOf(`"${propName}"`);
            const pos = new vscode.Position(i, finalIdx >= 0 ? finalIdx + 1 : 0);
            return new vscode.Location(vscode.Uri.file(tsPath), pos);
        }
    }

    const interfacePropPattern = new RegExp(`\\b${escaped}\\s*[:?]\\s*`);
    for (let i = 0; i < lines.length; i++) {
        if (interfacePropPattern.test(lines[i]) && !lines[i].includes('(') && !lines[i].includes('function')) {
            const idx = lines[i].indexOf(propName);
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx));
        }
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`this.$data.${propName}`)) {
            const idx = lines[i].indexOf(propName);
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx));
        }
    }

    return null;
}

function findDataDefinitionInTsFile(tsPath: string): vscode.Location | null {
    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        if (/\binterface\s+\w*Data\b/.test(lines[i])) {
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, 0));
        }
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('BaseElement<') && !lines[i].includes('import')) {
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, 0));
        }
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('super({')) {
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, 0));
        }
    }

    return null;
}

function findRefInTsFile(tsPath: string, refName: string): vscode.Location | null {
    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');

    const refPatterns = [`this.$refs.${refName}`, `$refs.${refName}`, `${refName}Ref`, `${refName}Refs`];

    for (let i = 0; i < lines.length; i++) {
        for (const pattern of refPatterns) {
            if (lines[i].includes(pattern)) {
                const idx = lines[i].indexOf(pattern);
                return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx));
            }
        }
    }

    const escaped = escapeRegex(refName);
    const typeAnnotationPattern = new RegExp(`\\b${escaped}\\s*:\\s*HTML\\w+Element`);
    for (let i = 0; i < lines.length; i++) {
        if (typeAnnotationPattern.test(lines[i])) {
            const idx = lines[i].indexOf(refName);
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx));
        }
    }

    const genericRefPattern = new RegExp(`\\b${escaped}\\s*:\\s*`);
    for (let i = 0; i < lines.length; i++) {
        if (genericRefPattern.test(lines[i]) && !lines[i].includes('(') && !lines[i].includes('function')) {
            const idx = lines[i].indexOf(refName);
            return new vscode.Location(vscode.Uri.file(tsPath), new vscode.Position(i, idx));
        }
    }

    return null;
}

export function getMethodSignatures(tsPath: string): MethodSignature[] {
    if (!fs.existsSync(tsPath)) {
        return [];
    }

    const content = fs.readFileSync(tsPath, 'utf-8');
    const lines = content.split('\n');
    const signatures: MethodSignature[] = [];

    const methodRegex =
        /^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*(\w+(?:\[\])?))?\s*\{/;

    for (let i = 0; i < lines.length; i++) {
        const match = methodRegex.exec(lines[i]);
        if (match) {
            const name = match[1];
            if (name === 'constructor' || name === 'if' || name === 'for' || name === 'while') continue;

            const params = match[2] || '';
            const returnType = match[3] || 'void';
            const signature = `${name}(${params}): ${returnType}`;

            signatures.push({
                name,
                signature,
                range: new vscode.Range(i, 0, i, lines[i].length),
            });
        }
    }

    return signatures;
}

export function validateTemplate(document: vscode.TextDocument): TemplateDiagnostic[] {
    const diagnostics: TemplateDiagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    validateControlFlowTags(text, lines, diagnostics);
    validateInterpolations(lines, diagnostics);
    validateAttributeSyntax(lines, diagnostics);

    return diagnostics;
}

function validateControlFlowTags(text: string, lines: string[], diagnostics: TemplateDiagnostic[]): void {
    const tagStack: { tag: string; line: number; col: number }[] = [];
    const tagRegex = /<\/?([A-Za-z][A-Za-z0-9\-]*)/g;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const tagName = match[1].toLowerCase();
        const isClosing = fullMatch.startsWith('</');
        const pos = getLineCol(lines, match.index);

        if (!SOLELY_CONTROL_TAGS.has(tagName)) continue;

        if (isClosing) {
            if (tagStack.length === 0) {
                diagnostics.push({
                    message: `意外的闭合标签 </${tagName}>，没有对应的开始标签`,
                    range: new vscode.Range(pos.line, pos.col, pos.line, pos.col + fullMatch.length),
                    severity: vscode.DiagnosticSeverity.Error,
                });
            } else {
                const last = tagStack[tagStack.length - 1];
                const validClose = getValidClosingTag(last.tag);
                if (tagName === last.tag || tagName === validClose) {
                    tagStack.pop();
                } else {
                    diagnostics.push({
                        message: `标签不匹配: 期望 </${last.tag}>，但找到 </${tagName}>`,
                        range: new vscode.Range(pos.line, pos.col, pos.line, pos.col + fullMatch.length),
                        severity: vscode.DiagnosticSeverity.Error,
                    });
                }
            }
        } else {
            tagStack.push({ tag: tagName, line: pos.line, col: pos.col });
        }
    }

    for (const unclosed of tagStack) {
        diagnostics.push({
            message: `未闭合的标签 <${unclosed.tag}>`,
            range: new vscode.Range(unclosed.line, unclosed.col, unclosed.line, unclosed.col + unclosed.tag.length + 1),
            severity: vscode.DiagnosticSeverity.Error,
        });
    }
}

function getValidClosingTag(tag: string): string {
    const hierarchy: Record<string, string> = {
        if: 'if',
        elseif: 'if',
        else: 'if',
        for: 'for',
    };
    return hierarchy[tag] || tag;
}

function validateInterpolations(lines: string[], diagnostics: TemplateDiagnostic[]): void {
    let inInterpolation = false;
    let interpolationStartLine = 0;
    let interpolationStartCol = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (inInterpolation) {
            const closeIdx = line.indexOf('}}');
            if (closeIdx >= 0) {
                inInterpolation = false;
            }
            continue;
        }

        let searchFrom = 0;
        while (searchFrom < line.length) {
            const openIdx = line.indexOf('{{', searchFrom);
            if (openIdx === -1) break;

            const closeIdx = line.indexOf('}}', openIdx + 2);
            if (closeIdx === -1) {
                inInterpolation = true;
                interpolationStartLine = i;
                interpolationStartCol = openIdx;
                diagnostics.push({
                    message: '插值表达式未闭合，缺少 }}',
                    range: new vscode.Range(i, openIdx, i, line.length),
                    severity: vscode.DiagnosticSeverity.Error,
                });
                break;
            }

            searchFrom = closeIdx + 2;
        }

        const strayClose = /(?<!\{)\}\}(?!\})/.exec(line);
        if (strayClose && !line.includes('{{')) {
            diagnostics.push({
                message: '意外的 }} ，缺少 {{',
                range: new vscode.Range(i, strayClose.index, i, strayClose.index + 2),
                severity: vscode.DiagnosticSeverity.Warning,
            });
        }
    }

    if (inInterpolation) {
        diagnostics.push({
            message: `插值表达式从第 ${interpolationStartLine + 1} 行开始未闭合`,
            range: new vscode.Range(
                interpolationStartLine,
                interpolationStartCol,
                lines.length - 1,
                lines[lines.length - 1].length,
            ),
            severity: vscode.DiagnosticSeverity.Error,
        });
    }
}

function validateAttributeSyntax(lines: string[], diagnostics: TemplateDiagnostic[]): void {
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const unquotedAt = /@(\w+)\s*=\s*([^\s"'][^\s>]*)/g;
        let m: RegExpExecArray | null;
        while ((m = unquotedAt.exec(line)) !== null) {
            if (!line.includes(`@${m[1]}="${m[2]}"`) && !line.includes(`@${m[1]}='${m[2]}'`)) {
                diagnostics.push({
                    message: `事件绑定 @${m[1]} 的值建议使用引号包裹`,
                    range: new vscode.Range(i, m.index, i, m.index + m[0].length),
                    severity: vscode.DiagnosticSeverity.Warning,
                });
            }
        }

        const unquotedBind = /:(?!class\b|style\b)(\w+(?:-\w+)*)\s*=\s*([^\s"'][^\s>]*)/g;
        while ((m = unquotedBind.exec(line)) !== null) {
            if (!line.includes(`:${m[1]}="${m[2]}"`) && !line.includes(`:${m[1]}='${m[2]}'`)) {
                diagnostics.push({
                    message: `属性绑定 :${m[1]} 的值建议使用引号包裹`,
                    range: new vscode.Range(i, m.index, i, m.index + m[0].length),
                    severity: vscode.DiagnosticSeverity.Warning,
                });
            }
        }
    }
}

function getLineCol(lines: string[], charIndex: number): { line: number; col: number } {
    let currentIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1;
        if (currentIndex + lineLength > charIndex) {
            return { line: i, col: charIndex - currentIndex };
        }
        currentIndex += lineLength;
    }
    return { line: lines.length - 1, col: 0 };
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
