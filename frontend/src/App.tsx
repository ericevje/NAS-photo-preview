import Layout from "./components/Layout";
import PhotoGrid from "./components/PhotoGrid";
import TimelineView from "./components/TimelineView";
import MapView from "./components/MapView";
import LoupeView from "./components/LoupeView";
import ExportPanel from "./components/ExportPanel";
import ImportPanel from "./components/ImportPanel";
import { usePhotoStore } from "./stores/photoStore";

function App() {
  const view = usePhotoStore((s) => s.view);
  const loupePhotoId = usePhotoStore((s) => s.loupePhotoId);
  const exportOpen = usePhotoStore((s) => s.exportOpen);
  const closeExport = usePhotoStore((s) => s.closeExport);
  const importOpen = usePhotoStore((s) => s.importOpen);
  const closeImport = usePhotoStore((s) => s.closeImport);

  return (
    <Layout>
      {view === "grid" && <PhotoGrid />}
      {view === "timeline" && <TimelineView />}
      {view === "map" && <MapView />}
      {loupePhotoId !== null && <LoupeView />}
      {exportOpen && <ExportPanel onClose={closeExport} />}
      {importOpen && <ImportPanel onClose={closeImport} />}
    </Layout>
  );
}

export default App;
