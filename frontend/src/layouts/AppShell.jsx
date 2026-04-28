import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';

function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-midnight text-white">
      <div className="fixed inset-0 -z-10 bg-mesh opacity-100" />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col lg:pl-72">
          <Navbar />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

export default AppShell;
