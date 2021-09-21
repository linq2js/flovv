const fs = require("fs");
const path = require("path");

makeLink(
  path.resolve("./packages/demo-react/src/flovv1"),
  path.resolve("./packages/flovv/src")
);

function makeLink(source, target) {
  fs.symlinkSync(source, target, "dir");
}
