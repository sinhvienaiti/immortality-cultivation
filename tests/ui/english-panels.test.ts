import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const VIETNAMESE = /[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯư\u1ea0-\u1ef9]/u;

describe("English results and review interface", () => {
  for (const name of ["results", "review-card"]) {
    it(`${name} keeps Vietnamese out of interface literals; learning glosses come from word data`, () => {
      const source = readFileSync(new URL(`../../src/ui/${name}.ts`, import.meta.url), "utf8");
      const file = ts.createSourceFile(`${name}.ts`, source, ts.ScriptTarget.Latest, true);
      const violations: string[] = [];
      const visit = (node: ts.Node): void => {
        if ((ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && VIETNAMESE.test(node.text)) {
          violations.push(node.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      expect(violations).toEqual([]);
    });
  }
});
