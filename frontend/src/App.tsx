import Layout from "./components/Layout";
import PhotoGrid from "./components/PhotoGrid";
import LoupeView from "./components/LoupeView";
import { usePhotoStore } from "./stores/photoStore";

function App() {
  const view = usePhotoStore((s) => s.view);
  const loupePhotoId = usePhotoStore((s) => s.loupePhotoId);

  return (
    <Layout>
      {view === "grid" && <PhotoGrid />}
      {view === "timeline" && (
        <div className="flex h-64 items-center justify-center text-neutral-500">
          Timeline view coming in Phase 4.
        </div>
      )}
      {view === "map" && (
        <div className="flex h-64 items-center justify-center text-neutral-500">
          Map view coming in Phase 4.
        </div>
      )}
      {loupePhotoId !== null && <LoupeView />}
    </Layout>
  );
}

export default App;
