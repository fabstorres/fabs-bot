import { describe, expect, test } from "bun:test";
import { botsNamed, linkHandles, mentionedBots, readable, splitMarkdownMentions } from "./mentions";

const chief = { id: "00000000-0000-4000-8000-000000000001", name: "Chief" };
const staff = { id: "00000000-0000-4000-8000-000000000002", name: "Chief of Staff" };
const issues = { id: "00000000-0000-4000-8000-000000000003", name: "Github Issues" };
const bots = [chief, staff, issues];
const names = (text: string, list = bots) => mentionedBots(text, list).map((b) => b.name);
const at = (bot: { id: string }) => `<@${bot.id}>`;

describe("id mentions", () => {
  test("text typed or escaped right after a mention can't turn it into another bot", () => {
    expect(names(`${at(chief)} of Staff, reply`)).toEqual(["Chief"]);
    expect(names(`${at(chief)}&#32;of Staff reply`)).toEqual(["Chief"]);
  });

  test("mentions inside code or links are not mentions", () => {
    expect(names(`run \`${at(chief)}\` now`)).toEqual([]);
    expect(names(`\`\`\`\n${at(chief)}\n\`\`\``)).toEqual([]);
    expect(names(`[${at(chief)}](https://example.com)`)).toEqual([]);
  });

  test("a plain @Name is not a mention", () => {
    expect(names("@Chief ping")).toEqual([]);
  });

  test("a deleted bot's mention reads as a deleted bot", () => {
    expect(readable(`hi ${at({ id: "00000000-0000-4000-8000-0000000000ff" })}!`, bots)).toBe("hi @deleted bot!");
  });

  test("a draft or paste only turns mentions outside code and links into chips", () => {
    expect(splitMarkdownMentions(`\`${at(chief)}\` [${at(chief)}](https://example.com) ${at(chief)}`, bots)).toEqual([
      `\`${at(chief)}\` [${at(chief)}](https://example.com) `,
      { bot: chief, text: at(chief) },
    ]);
  });

  test("bots read mentions as handles", () => {
    expect(readable(`${at(staff)} and ${at(chief)}`, bots)).toBe("@ChiefofStaff and @Chief");
  });
});

describe("handles written by bots", () => {
  test("a longer name that starts with another bot's name links only the longer one", () => {
    expect(linkHandles("@Chief of Staff ping", bots)).toBe(`${at(staff)} ping`);
    expect(linkHandles("@ChiefofStaff and @chief-of-staff", bots)).toBe(`${at(staff)} and ${at(staff)}`);
    expect(linkHandles("@ChiefofStaff ping", [chief])).toBe("@ChiefofStaff ping");
  });

  test("punctuation right after a handle still ends it", () => {
    expect(linkHandles("thanks @Chief, and (@GithubIssues).", bots)).toBe(`thanks ${at(chief)}, and (${at(issues)}).`);
  });

  test("handles glued to letters, digits or hyphens stay plain", () => {
    expect(linkHandles("mail fabs@chief.com, @Chief2 and @Chief-bot", bots)).toBe("mail fabs@chief.com, @Chief2 and @Chief-bot");
  });

  test("handles inside code or links stay plain, and the rest of the text is kept exactly", () => {
    const text = "run `@Chief` [@Chief](https://example.com) https://example.com/@Chief\n\n```\n@Chief\n```\nfile\\_name @Chief";
    expect(linkHandles(text, bots)).toBe(text.replace(/@Chief$/, at(chief)));
  });

  test("a handle whose escapes name a different bot once decoded stays plain", () => {
    expect(linkHandles("@Chief&#32;of Staff reply", bots)).toBe("@Chief&#32;of Staff reply");
  });

  test("a handle two bots share stays plain", () => {
    expect(linkHandles("hi @Chief", [chief, { id: "00000000-0000-4000-8000-000000000004", name: "chief" }])).toBe("hi @Chief");
  });
});

describe("botsNamed", () => {
  const named = (name: string, list = bots) => botsNamed(name, list).map((b) => b.name);

  test("a shorter name never matches a longer one that starts with it", () => {
    expect(named("chief")).toEqual(["Chief"]);
    expect(named("@ChiefofStaff")).toEqual(["Chief of Staff"]);
  });

  test("names that share a handle are all returned so callers can refuse the ambiguity", () => {
    const twin = { id: "00000000-0000-4000-8000-000000000004", name: "Github-Issues" };
    expect(named("github-issues", [...bots, twin])).toEqual(["Github Issues", "Github-Issues"]);
  });
});
