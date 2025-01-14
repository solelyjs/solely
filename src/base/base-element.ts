import { ASTNode, parseHtml, isObject, patch, runInAsyncQueue, observe } from "../utils";
import { Manifest } from "./decorators";

declare interface BaseElement {
    _manifest: Manifest;
}

class BaseElement extends HTMLElement {
    #data: any = {};
    #AST: ASTNode[] = [];
    #vNodes: ASTNode[] = [];
    #refreshing: boolean = false;
    #initialized: boolean = false;
    #root: Element | ShadowRoot;

    constructor() {
        super();
        const manifest = this._manifest || {};
        if (manifest.template && typeof manifest.template === "string") {
            this.#AST = parseHtml(this, manifest.template);
        }

        if (manifest.shadowDOM && manifest.shadowDOM.use) {
            this.#root = this.attachShadow({
                mode: manifest.shadowDOM.mode || 'open'
            });
        }
        else {
            this.#root = this;
        }
    }

    public get $data(): any {
        let val = this.#data;
        if (isObject(val)) {
            val = observe(val, () => this.#refresh());
        }
        return val;
    }

    public set $data(value: any) {
        this.#data = value || {};
        this.#refresh();
    }

    #refresh(): void {
        if (this.#refreshing) return;
        this.#refreshing = true;
        runInAsyncQueue(() => {
            this.#vNodes = patch(this.#root, this.#AST, this.#vNodes);
            this.#refreshing = false;
            if (this.isConnected && !this.#initialized) {
                this.#initialized = true;
                this.onInit();
            }
        });
    }

    connectedCallback(): void {
        const manifest = this._manifest || {};
        const className = manifest.className || manifest.tagName || "";
        className.split(" ").forEach((name) => {
            name && this.classList.add(name)
        });
        this.#refresh();
    }

    public onInit(): Promise<void> | void { }

    disconnectedCallback(): void {
        // console.log(`disconnectedCallback`);
    }
}

export default BaseElement;