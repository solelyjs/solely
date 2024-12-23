import { ASTNode, parseHtml, isObject, patch, runInAsyncQueue } from "../../utils";
import { Manifest } from "./decorators";

declare interface BaseElement {
    _manifest: Manifest;
}

class BaseElement extends HTMLElement {
    #data: any = {};
    #AST: ASTNode[] = [];
    #vNodes: ASTNode[] = [];
    #refreshing: boolean = false;

    constructor() {
        super();
        const manifest = this._manifest || {};
        if (manifest.template && typeof manifest.template === "string") {
            this.#AST = parseHtml(this, manifest.template);
        }

        const className = manifest.className || manifest.tagName || "";
        className.split(" ").forEach((name) => {
            this.classList.add(name);
        });
    }

    public get $data(): any {
        let val = this.#data;
        if (isObject(val)) {
            val = this.#observe(val);
        }
        return val;
    }

    public set $data(value: any) {
        this.#data = value;
        this.#refresh();
    }

    #observe(value: any): any {
        return new Proxy(value, {
            get: (target, p) => {
                let val = target[p];
                if (isObject(val)) {
                    val = this.#observe(val);
                }
                return val;
            },
            set: (target, p, val) => {
                if (target[p] !== val) {
                    target[p] = val;
                    this.#refresh();
                }
                return true;
            },
        });
    }

    #refresh(): void {
        if (this.#refreshing) return;
        this.#refreshing = true;
        runInAsyncQueue(() => {
            this.#vNodes = patch(this, this.#AST, this.#vNodes);
            this.#refreshing = false;
        });
    }

    connectedCallback(): void {
        this.#vNodes = patch(this, this.#AST, this.#vNodes);
        this.onInit();
    }

    public onInit(): Promise<void> | void { }

    disconnectedCallback(): void {
        console.log(`disconnectedCallback`);
    }
}

export default BaseElement;