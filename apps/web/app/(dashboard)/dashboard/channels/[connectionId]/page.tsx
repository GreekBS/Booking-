import { ChannelDetailPage } from "@/features/channels/ChannelDetailPage";

type Params = { params: Promise<{ connectionId: string }> };

export default async function Page({ params }: Params) {
  const { connectionId } = await params;
  return <ChannelDetailPage connectionId={connectionId} />;
}
