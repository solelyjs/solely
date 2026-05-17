import { describe, it, expect } from 'vitest';
import { parseHtml } from '../src/compiler/parser/parser';
import { ASTType } from '../src/types';

describe('parseHtml', () => {
    describe('basic elements', () => {
        it('should parse a single element', () => {
            const ast = parseHtml('<div></div>');
            expect(ast).toHaveLength(1);
            expect(ast[0].type).toBe(ASTType.Element);
            expect(ast[0].tag).toBe('div');
        });

        it('should parse nested elements', () => {
            const ast = parseHtml('<div><span>text</span></div>');
            expect(ast).toHaveLength(1);
            expect(ast[0].tag).toBe('div');
            expect(ast[0].children).toHaveLength(1);
            expect(ast[0].children![0].tag).toBe('span');
            expect(ast[0].children![0].children).toHaveLength(1);
            expect(ast[0].children![0].children![0].type).toBe(ASTType.Text);
            expect(ast[0].children![0].children![0].content).toBe('text');
        });

        it('should parse sibling elements', () => {
            const ast = parseHtml('<div></div><span></span>');
            expect(ast).toHaveLength(2);
            expect(ast[0].tag).toBe('div');
            expect(ast[1].tag).toBe('span');
        });

        it('should parse void elements (self-closing)', () => {
            const ast = parseHtml('<br><hr><img src="test.png">');
            expect(ast).toHaveLength(3);
            expect(ast[0].tag).toBe('br');
            expect(ast[1].tag).toBe('hr');
            expect(ast[2].tag).toBe('img');
        });

        it('should parse self-closing tags', () => {
            const ast = parseHtml('<br/>');
            expect(ast).toHaveLength(1);
            expect(ast[0].tag).toBe('br');
            expect(ast[0].children).toHaveLength(0);
        });
    });

    describe('text and whitespace', () => {
        it('should parse text content', () => {
            const ast = parseHtml('<p>Hello World</p>');
            expect(ast[0].children).toHaveLength(1);
            expect(ast[0].children![0].type).toBe(ASTType.Text);
            expect(ast[0].children![0].content).toBe('Hello World');
        });

        it('should trim whitespace in text nodes', () => {
            const ast = parseHtml('<div>  hello  </div>');
            expect(ast[0].children![0].content).toBe('hello');
        });

        it('should merge adjacent text nodes', () => {
            const ast = parseHtml('<div>hello {{ name }}</div>');
            expect(ast[0].children).toHaveLength(1);
            expect(ast[0].children![0].content).toBe('hello {{ name }}');
        });

        it('should preserve whitespace in pre/code/textarea/script/style', () => {
            const ast = parseHtml('<pre>\n  hello\n</pre>');
            const preChildren = ast[0].children!;
            expect(preChildren).toHaveLength(1);
            expect(preChildren[0].content).toBe('\n  hello\n');
        });
    });

    describe('attributes', () => {
        it('should parse static attributes', () => {
            const ast = parseHtml('<div class="container" id="main"></div>');
            expect(ast[0].attrs).toHaveLength(2);
            const classAttr = ast[0].attrs!.find(a => a.key === 'class');
            const idAttr = ast[0].attrs!.find(a => a.key === 'id');
            expect(classAttr?.value).toBe('container');
            expect(idAttr?.value).toBe('main');
        });

        it('should parse boolean attributes', () => {
            const ast = parseHtml('<input disabled>');
            expect(ast[0].attrs).toHaveLength(1);
            expect(ast[0].attrs![0].key).toBe('disabled');
            expect(ast[0].attrs![0].value).toBe('');
        });

        it('should parse dynamic attributes with : prefix', () => {
            const ast = parseHtml('<img :src="$data.url" :alt="$data.name">');
            const attrs = ast[0].attrs!;
            expect(attrs).toHaveLength(2);
            expect(attrs[0].key).toBe(':src');
            expect(attrs[0].value).toBe('$data.url');
            expect(attrs[1].key).toBe(':alt');
            expect(attrs[1].value).toBe('$data.name');
        });
    });

    describe('event bindings', () => {
        it('should parse @click syntax', () => {
            const ast = parseHtml('<button @click="$data.count++">click</button>');
            const attrs = ast[0].attrs!;
            expect(attrs).toHaveLength(1);
            expect(attrs[0].key).toBe('@click');
            expect(attrs[0].value).toBe('$data.count++');
        });

        it('should convert onclick to @click', () => {
            const ast = parseHtml('<button onclick="$data.count++">click</button>');
            const attrs = ast[0].attrs!;
            expect(attrs).toHaveLength(1);
            expect(attrs[0].key).toBe('@click');
        });

        it('should convert on-input to @input', () => {
            const ast = parseHtml('<input on-input="$data.search = value">');
            expect(ast[0].attrs![0].key).toBe('@input');
        });
    });

    describe('conditional rendering (If/ElseIf/Else)', () => {
        it('should parse If element', () => {
            const ast = parseHtml('<If test="$data.show"><p>visible</p></If>');
            expect(ast[0].type).toBe(ASTType.If);
            expect(ast[0].children).toHaveLength(1);
        });

        it('should parse If with condition alias', () => {
            const ast = parseHtml('<If condition="$data.show"><p>visible</p></If>');
            expect(ast[0].type).toBe(ASTType.If);
            const condAttr = ast[0].attrs!.find(a => a.key === 'condition');
            expect(condAttr?.value).toBe('$data.show');
        });

        it('should parse If/ElseIf/Else chain as sibling nodes', () => {
            const ast = parseHtml(
                '<If test="$data.s === 1"><p>one</p></If><ElseIf test="$data.s === 2"><p>two</p></ElseIf><Else><p>other</p></Else>',
            );
            // parser keeps them as individual nodes; buildIR merges into Conditional
            expect(ast[0].type).toBe(ASTType.If);
            expect(ast[1].type).toBe(ASTType.ElseIf);
            expect(ast[2].type).toBe(ASTType.Else);
            expect(ast[0].children![0].children![0].content).toBe('one');
            expect(ast[1].children![0].children![0].content).toBe('two');
            expect(ast[2].children![0].children![0].content).toBe('other');
        });

        it('should parse standalone Else', () => {
            const ast = parseHtml('<Else><p>default</p></Else>');
            expect(ast[0].type).toBe(ASTType.Else);
            expect(ast[0].children![0].children![0].content).toBe('default');
        });
    });

    describe('loop rendering (For)', () => {
        it('should parse For element with each and item', () => {
            const ast = parseHtml('<For each="$data.items" item="it"><span>{{ it }}</span></For>');
            expect(ast[0].type).toBe(ASTType.For);
            expect(ast[0].attrs).toBeDefined();
            const eachAttr = ast[0].attrs!.find(a => a.key === 'each');
            const itemAttr = ast[0].attrs!.find(a => a.key === 'item');
            expect(eachAttr?.value).toBe('$data.items');
            expect(itemAttr?.value).toBe('it');
        });

        it('should parse For element with each, item, and index', () => {
            const ast = parseHtml('<For each="$data.items" item="it" index="i"><span>{{ i }}: {{ it }}</span></For>');
            const indexAttr = ast[0].attrs!.find(a => a.key === 'index');
            expect(indexAttr?.value).toBe('i');
        });

        it('should have children inside For', () => {
            const ast = parseHtml('<For each="$data.items" item="it"><li>{{ it.name }}</li></For>');
            expect(ast[0].children).toHaveLength(1);
            expect(ast[0].children![0].tag).toBe('li');
        });
    });

    describe('comments', () => {
        it('should parse comments', () => {
            const ast = parseHtml('<!-- comment --><div></div>');
            expect(ast[0].type).toBe(ASTType.Comment);
            expect(ast[0].content).toBe(' comment ');
            expect(ast[1].type).toBe(ASTType.Element);
        });

        it('should parse multiline comments', () => {
            const ast = parseHtml('<!--\n  line1\n  line2\n--><div></div>');
            expect(ast[0].type).toBe(ASTType.Comment);
            expect(ast[0].content).toBe('\n  line1\n  line2\n');
        });
    });

    describe('CDATA and processing instructions', () => {
        it('should parse CDATA sections', () => {
            const ast = parseHtml('<div><![CDATA[ <test>content</test> ]]></div>');
            expect(ast[0].children).toHaveLength(1);
            expect(ast[0].children![0].type).toBe(ASTType.Text);
            expect(ast[0].children![0].content).toBe(' <test>content</test> ');
        });

        it('should parse processing instructions', () => {
            const ast = parseHtml('<?xml version="1.0"?><div></div>');
            // processing instruction becomes a comment node
            const divNode = ast.find(n => n.type === ASTType.Element);
            expect(divNode).toBeDefined();
            expect(divNode!.tag).toBe('div');
        });
    });

    describe('script and style', () => {
        it('should parse script content as text', () => {
            const ast = parseHtml('<script>console.log("test")</script>');
            expect(ast[0].tag).toBe('script');
            expect(ast[0].children).toHaveLength(1);
            expect(ast[0].children![0].type).toBe(ASTType.Text);
            expect(ast[0].children![0].content).toBe('console.log("test")');
        });

        it('should parse style content as text', () => {
            const ast = parseHtml('<style>.test { color: red; }</style>');
            expect(ast[0].tag).toBe('style');
            expect(ast[0].children).toHaveLength(1);
            expect(ast[0].children![0].type).toBe(ASTType.Text);
            expect(ast[0].children![0].content).toBe('.test { color: red; }');
        });

        it('should handle script without closing tag', () => {
            const ast = parseHtml('<script>console.log("test")');
            expect(ast[0].tag).toBe('script');
            expect(ast[0].children).toHaveLength(1);
        });
    });

    describe('edge cases', () => {
        it('should handle empty string', () => {
            const ast = parseHtml('');
            expect(ast).toEqual([]);
        });

        it('should handle plain text without tags', () => {
            const ast = parseHtml('just text');
            expect(ast).toHaveLength(1);
            expect(ast[0].type).toBe(ASTType.Text);
            expect(ast[0].content).toBe('just text');
        });

        it('should handle DOCTYPE', () => {
            const ast = parseHtml('<!DOCTYPE html><div></div>');
            expect(ast.length).toBeGreaterThanOrEqual(1);
            const divNode = ast.find(n => n.type === ASTType.Element && n.tag === 'div');
            expect(divNode).toBeDefined();
            expect(divNode!.type).toBe(ASTType.Element);
            expect(divNode!.tag).toBe('div');
        });

        it('should parse s-model attribute', () => {
            const ast = parseHtml('<input s-model="$data.username">');
            expect(ast[0].attrs![0].key).toBe('s-model');
            expect(ast[0].attrs![0].value).toBe('$data.username');
        });

        it('should parse lifecycle attributes', () => {
            const ast = parseHtml('<label mounted="this.onMount(el)" updated="this.onUpdate(el)"></label>');
            const attrs = ast[0].attrs!;
            expect(attrs).toHaveLength(2);
            const mounted = attrs.find(a => a.key === 'mounted');
            const updated = attrs.find(a => a.key === 'updated');
            expect(mounted?.value).toBe('this.onMount(el)');
            expect(updated?.value).toBe('this.onUpdate(el)');
        });

        it('should parse ref attribute', () => {
            const ast = parseHtml('<input ref="usernameInput">');
            expect(ast[0].attrs![0].key).toBe('ref');
            expect(ast[0].attrs![0].value).toBe('usernameInput');
        });

        it('should handle non-void self-closing element', () => {
            const ast = parseHtml('<div/><span></span>');
            const divNode = ast.find(n => n.tag === 'div');
            expect(divNode).toBeDefined();
        });

        it('should parse single-quoted attributes', () => {
            const ast = parseHtml("<input type='text'>");
            expect(ast[0].attrs![0].key).toBe('type');
            expect(ast[0].attrs![0].value).toBe('text');
        });

        it('should parse unquoted attribute values', () => {
            const ast = parseHtml('<input type=text class=main>');
            const typeAttr = ast[0].attrs!.find(a => a.key === 'type');
            const classAttr = ast[0].attrs!.find(a => a.key === 'class');
            expect(typeAttr?.value).toBe('text');
            expect(classAttr?.value).toBe('main');
        });

        it('should handle multiple text and element interleaving', () => {
            const ast = parseHtml('<div>hello<b>world</b>!</div>');
            expect(ast[0].children).toHaveLength(3);
            expect(ast[0].children![0].type).toBe(ASTType.Text);
            expect(ast[0].children![0].content).toBe('hello');
            expect(ast[0].children![1].tag).toBe('b');
            expect(ast[0].children![2].type).toBe(ASTType.Text);
            expect(ast[0].children![2].content).toBe('!');
        });

        it('should handle comment-only content', () => {
            const ast = parseHtml('<!-- just a comment -->');
            expect(ast).toHaveLength(1);
            expect(ast[0].type).toBe(ASTType.Comment);
        });

        it('should handle pure whitespace text between tags being dropped', () => {
            const ast = parseHtml('<div>\n  \t\n</div>');
            expect(ast[0].children).toHaveLength(0);
        });

        it('should handle unclosed tag at end of html', () => {
            const ast = parseHtml('<div><span>hello');
            expect(ast).toHaveLength(1);
            expect(ast[0].tag).toBe('div');
            expect(ast[0].children).toHaveLength(1);
            expect(ast[0].children![0].tag).toBe('span');
        });

        it('should handle unclosed tag with dangling partial tag', () => {
            const ast = parseHtml('<div><');
            expect(ast).toHaveLength(1);
            expect(ast[0].tag).toBe('div');
        });

        it('should handle mismatched closing tags gracefully', () => {
            const ast = parseHtml('<div><span></div>');
            expect(ast).toHaveLength(1);
            expect(ast[0].tag).toBe('div');
        });

        it('should handle extra closing tag gracefully', () => {
            const ast = parseHtml('<div></div></span>');
            expect(ast).toHaveLength(1);
            expect(ast[0].tag).toBe('div');
        });
    });
});
