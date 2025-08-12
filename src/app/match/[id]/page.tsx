import MatchClient from './MatchClient';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <MatchClient matchId={id} />;
}
