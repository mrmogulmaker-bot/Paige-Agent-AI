update public.paige_subagents set runtime='local', edge_function='subagent-data-consistency' where slug='data-consistency-auditor';
update public.paige_subagents set runtime='local', edge_function='subagent-market-research' where slug='market-research';
update public.paige_subagents set runtime='local', edge_function='subagent-financial-research' where slug='financial-research';