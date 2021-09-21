const fs = require("fs");
const path = require("path");

fs.symlinkSync(
  path.resolve("./packages/demo-react/src/flovv"),
  path.resolve("./packages/flovv/src")
);
