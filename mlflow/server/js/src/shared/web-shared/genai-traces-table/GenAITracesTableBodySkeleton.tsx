import type { Table } from '@tanstack/react-table';

import { ParagraphSkeleton, TableSkeletonRows, useDesignSystemTheme } from '@databricks/design-system';
import { useIntl } from 'react-intl';

import type { EvalTraceComparisonEntry } from './types';

export const GenAITracesTableBodySkeleton = ({
  className,
  table,
}: {
  className?: string;
  table?: Table<EvalTraceComparisonEntry>;
}) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const loadingLabel = intl.formatMessage({
    defaultMessage: 'Loading...',
    description: 'Accessible name for a loading placeholder',
  });
  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.backgroundPrimary,
      }}
      className={className}
    >
      {table ? (
        <TableSkeletonRows label={loadingLabel} numRows={3} table={table} />
      ) : (
        [...Array(10).keys()].map((i) => <ParagraphSkeleton label={loadingLabel} key={i} seed={`s-${i}`} />)
      )}
    </div>
  );
};
