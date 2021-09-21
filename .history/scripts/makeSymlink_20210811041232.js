const fs = require("fs");
const path = require("path");

makeLink(
  path.resolve("./packages/flovv/src"),
  path.resolve("./packages/react-demo/src/flovv")
);

function makeLink(source, target) {
  fs.symlinkSync(source, target, "dir");
}
