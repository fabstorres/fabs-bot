import { describe, expect, test } from "bun:test";
import { mentionedBots, splitMentions } from "./mentions";

const chief = { name: "Chief" };
const staff = { name: "Chief of Staff" };
const issues = { name: "Github Issues" };
const bots = [chief, staff, issues];
const names = (text: string, list = bots) => mentionedBots(text, list).map((b) => b.name);

describe("mention matching", () => {
  test("a longer name that starts with another bot's name wakes only the longer one", () => {
    expect(names("@ChiefofStaff ping")).toEqual(["Chief of Staff"]);
    expect(names("@Chief of Staff ping")).toEqual(["Chief of Staff"]);
    expect(names("@chief-of-staff ping")).toEqual(["Chief of Staff"]);
    expect(names("@ChiefofStaff ping", [chief])).toEqual([]);
  });

  test("punctuation right after a handle still ends it", () => {
    expect(names("thanks @Chief, and @GithubIssues.")).toEqual(["Chief", "Github Issues"]);
    expect(names("@Chief's call (@ChiefofStaff)")).toEqual(["Chief", "Chief of Staff"]);
  });

  test("handles glued to letters, digits or hyphens are not mentions", () => {
    expect(names("mail fabs@chief.com")).toEqual([]);
    expect(names("@Chief2 and @Chief-bot")).toEqual([]);
  });

  test("handles inside code or links are not mentions", () => {
    expect(names("run `@Chief` now")).toEqual([]);
    expect(names("```\n@Chief\n```")).toEqual([]);
    expect(names("[@Chief](https://example.com) and https://example.com/@Chief")).toEqual([]);
  });

  test("a handle two bots share stays plain text", () => {
    const twin = { name: "chief" };
    expect(splitMentions("hi @Chief", [chief, twin])).toEqual(["hi @Chief"]);
  });

  test("splits text around each mention and keeps what was typed", () => {
    expect(splitMentions("ask @githubissues now", bots)).toEqual(["ask ", { bot: issues, text: "@githubissues" }, " now"]);
  });
});
