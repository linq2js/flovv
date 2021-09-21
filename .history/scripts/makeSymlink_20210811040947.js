const fs = require("fs");
const path = require("path");

makeLink(
  path.resolve("./packages/demo-react/src/flovv"),
  path.resolve("./packages/flovv/src")
);

function makeLink(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  fs.symlinkSync(source, target, "dir");
}
