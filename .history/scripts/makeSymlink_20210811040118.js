const fs = require("fs");
const path = require("path");

fs.symlinkSync(
  path.resolve("./packages/flovv/src"),
  path.resolve("./packages/demo-react/src/flovv")
);

function makeLink(source, target) {
  fs.symlinkSync(
    path.resolve("./packages/flovv/src"),
    path.resolve("./packages/demo-react/src/flovv")
  );
}
