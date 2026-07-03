import { MessagesPage as MessagesView } from "@/components/messages/MessagesPage";

export default function MessagesPage() {
  return (
    <div className="container mx-auto p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-4">Сообщения</h1>
      <MessagesView />
    </div>
  );
}
