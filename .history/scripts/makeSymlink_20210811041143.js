const fs = require("fs");
const path = require("path");

makeLink(
  path.resolve("./packages/react-demo/src/flovv"),
  path.resolve("./packages/flovv/src")
);

function makeLink(source, target) {
  fs.symlinkSync(source, target, "dir");
}
