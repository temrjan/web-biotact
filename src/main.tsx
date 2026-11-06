import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import { returnAddress } from "./navigation";
// Payment return: show the order view without a reload and drop the provider query.
const back = returnAddress(window.location.search);
if (back) history.replaceState(null, "", back);
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
