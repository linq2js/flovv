const fs = require("fs-extra");
const path = require("path");

fs.copySync(
  path.resolve("./packages/flovv/src"),
  path.resolve("./packages/react-demo/src/flovv")
);
