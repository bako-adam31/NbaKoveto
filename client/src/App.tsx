import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
import { ComingSoon } from "./pages/ComingSoon";
import { Teams } from "./pages/Teams";
import { Players } from "./pages/Players";
import { Games } from "./pages/Games";
import { GameDetails } from "./pages/GameDetails";
import { Stats } from "./pages/Stats";
import { PlayerProfile } from "./pages/PlayerProfile";
import "./styles.css";
export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/games" element={<Games />} />
        <Route path="/games/:gameId" element={<GameDetails />} />
        <Route path="/players" element={<Players />} />
        <Route path="/players/:playerId" element={<PlayerProfile />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:teamId" element={<Teams />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="*" element={<ComingSoon />} />
      </Routes>
    </BrowserRouter>
  );
}
