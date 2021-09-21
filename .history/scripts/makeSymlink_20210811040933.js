const fs = require("fs");
const path = require("path");

makeLink(
  path.resolve("./packages/flovv/src"),
  path.resolve("./packages/demo-react/src/flovv")
);

function makeLink(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  fs.symlinkSync(source, target, "dir");
}
