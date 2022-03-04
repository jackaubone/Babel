import Koa from "koa";
import Router from "@koa/router";
import Pug from "koa-pug";
import serve from "koa-static";
import path from "path";
import memoize from "memoizee";
import { LINES, CHARS, ALPHA } from "./constants.js";
import {
  checkBounds,
  getPage,
  reverseLookupPage,
  getSequentialPageNumberFromIdentifier,
  getIdentifierFromSequentialPageNumber,
  getRandomPageIdentifier,
} from "./babel.js";

const getPageWithMeta = (identifier) => {
  const { info, lines } = getPage(identifier);

  const pageNumber = getSequentialPageNumberFromIdentifier(identifier);

  const prevPage = getIdentifierFromSequentialPageNumber(pageNumber.minus(1));
  const nextPage = getIdentifierFromSequentialPageNumber(pageNumber.plus(1));

  return { info, lines, prevPage, nextPage };
};

const getPageWithMetaMemo = memoize(getPageWithMeta, {
  maxAge: 1000 * 60 * 30,
});

const app = new Koa();
const router = new Router();
const pug = new Pug({
  viewPath: path.resolve(path.resolve(), "src/views"),
  app,
});

app.use(serve("src/public"));

app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.get("X-Response-Time");
  console.log(`${ctx.method} ${ctx.url} - ${rt}`);
});

app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.set("X-Response-Time", `${ms}ms`);
});

router.get("/", async (ctx) => {
  await ctx.render("index");
});

router
  .get("/ref/:identifier", async (ctx) => {
    const { identifier } = ctx.params;

    try {
      checkBounds(...identifier.split("."));
    } catch (e) {
      ctx.status = 400;
      ctx.body = e.message;
      return;
    }

    const { info, lines, prevPage, nextPage } = getPageWithMetaMemo(identifier);

    await ctx.render("page", { info, lines, prevPage, nextPage });
  })
  .get("/search", async (ctx) => {
    let { content } = ctx.request.query;

    if (!content) {
      await ctx.render("search");
      return;
    }

    if (content.replace(/\r/g, "").replace(/\n/g, "").length > LINES * CHARS) {
      ctx.status = 400;
      ctx.body = `Content cannot be longer than ${
        LINES * CHARS
      } characters long.`;
      return;
    }

    content = content
      .split("\n")
      .map((line, i) => {
        let chars = line.split("");
        chars.forEach((char, i) => {
          if (!ALPHA.includes(char)) chars[i] = " ";
        });
        if (chars.length < CHARS) {
          chars = chars.concat(Array(CHARS - line.length).fill(" "));
        }
        return chars.join("");
      })
      .join("");

    while (content.length < LINES * CHARS) content += " ";

    const identifier = reverseLookupPage(content.toLowerCase());

    ctx.status = 302;
    ctx.redirect(`/ref/${identifier}`);
  })
  .get("/random", (ctx) => {
    const randomIdentifier = getRandomPageIdentifier();

    ctx.status = 302;
    ctx.redirect(`/ref/${randomIdentifier}`);
  });

app.use(router.routes());
app.listen(5000);
console.log("listening on http://localhost:5000");
