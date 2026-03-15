import { IRLocal } from "@/types";
import { createFunction } from "./functions";

export type GenType = "template" | "handler" | "expression" | "lifecycle";

/* -------------------------------------------------------
 * 1. 模板预处理（处理 {{ expr }} 和非法 {{{ expr }}）
 * ----------------------------------------------------- */
function preprocessTemplate(code: string, type: GenType): string {
    if (!code?.trim()) return "";

    // 禁止 {{{ }}}
    if (/\{\{\{\s*.*?\s*\}\}\}/.test(code)) {
        throw new Error("Illegal interpolation syntax: use {{ }} instead of {{{ }}}");
    }

    // template 类型才处理 {{ expr }}
    if (type === "template") {
        return code.replace(/\{\{\s*(.*?)\s*\}\}/g, (_, expr) => {
            return `\${${expr.trim()}}`;
        });
    }

    return code;
}

/* -------------------------------------------------------
 * 2. 根据类型生成函数体
 * ----------------------------------------------------- */
function buildBody(processedCode: string, type: GenType) {
    const ensureSemi = (s: string) => (s.endsWith(";") ? s : s + ";");

    switch (type) {
        case "template":
            return `return \`${processedCode}\`;`;

        case "expression":
            return `return (${processedCode});`;

        case "handler":
        case "lifecycle":
            return ensureSemi(processedCode);
    }
}

/* -------------------------------------------------------
 * 3. 循环变量注入代码（loops）
 * ----------------------------------------------------- */
function buildLoopContext(locals: IRLocal[]) {
    if (!locals.length) return { loopValues: "", loopIndices: "" };

    const items = locals.map(l => l.item).join(", ");
    const indices = locals.map(l => l.index).join(", ");

    return {
        loopValues: `var [${items}] = loops.map(l => l.itmVal);`,
        loopIndices: `var [${indices}] = loops.map(l => l.idxVal);`
    };
}

/* -------------------------------------------------------
 * 4. 参数生成 + 主内容拼接
 * ----------------------------------------------------- */
function buildArgs(
    type: GenType,
    body: string,
    loopValues: string,
    loopIndices: string
) {
    const args =
        type === "lifecycle"
            ? ["el", "loops"]
            : type === "handler"
                ? ["event", "loops"]
                : ["loops"];

    const eventVars =
        type === "handler"
            ? `const { value, checked } = event?.target || {};`
            : "";

    const content = `
        const { $data } = this;
        ${eventVars}
        ${loopValues}
        ${loopIndices}
        ${body}
    `.replace(/^\s+|\s+$/gm, ""); // 去除每行开头结尾空白

    args.push(content);
    return args;
}

/* -------------------------------------------------------
 * 6. 主入口：生成序列化函数
 * ----------------------------------------------------- */
export function genFunction(
    code: string,
    type: GenType,
    locals: IRLocal[]
) {
    if (!code?.trim()) return () => "";

    const processed = preprocessTemplate(code, type);
    const body = buildBody(processed, type);

    const { loopValues, loopIndices } = buildLoopContext(locals);
    const args = buildArgs(type, body, loopValues, loopIndices);

    return createFunction(args);
}
