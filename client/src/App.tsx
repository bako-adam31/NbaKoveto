import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
import { ComingSoon } from "./pages/ComingSoon";
import { Teams } from "./pages/Teams";
import { Players } from "./pages/Players";
import "./styles.css";
export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/games" element={<Home />} />
        <Route path="/players" element={<Players />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:teamId" element={<Teams />} />
        <Route path="/stats" element={<ComingSoon />} />
        <Route path="*" element={<ComingSoon />} />
      </Routes>
    </BrowserRouter>
  );
}
