import MatchClient from './MatchClient';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return (
    <div className="p-4 md:p-6">
      <MatchClient matchId={id} />
    </div>
  );
}
