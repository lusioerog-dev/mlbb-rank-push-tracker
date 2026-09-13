import React from "react";
import { createRoot } from "react-dom/client";
import { Cloud } from "./Cloud";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Cloud />
  </React.StrictMode>,
);
