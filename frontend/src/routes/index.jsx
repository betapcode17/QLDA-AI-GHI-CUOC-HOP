import { createBrowserRouter } from 'react-router-dom';
import App from '../App';
import ActionItems from '../pages/ActionItems';
import Dashboard from '../pages/Dashboard';
import MeetingDetail from '../pages/MeetingDetail';
import MeetingForm from '../pages/MeetingForm';
import MeetingsList from '../pages/MeetingsList';
import NotFound from '../pages/NotFound';
import Recording from '../pages/Recording';
import Settings from '../pages/Settings';
import UploadAudio from '../pages/UploadAudio';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'recording', element: <Recording /> },
      { path: 'upload-audio', element: <UploadAudio /> },
      { path: 'meetings', element: <MeetingsList /> },
      { path: 'meetings/new', element: <MeetingForm /> },
      { path: 'meetings/:id', element: <MeetingDetail /> },
      { path: 'meetings/:id/edit', element: <MeetingForm /> },
      { path: 'action-items', element: <ActionItems /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default router;
