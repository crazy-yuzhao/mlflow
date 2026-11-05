import { TableFilterInput, TableFilterLayout } from '@databricks/design-system';
import { useIntl } from 'react-intl';
import { ModelSearchInputHelpTooltip } from '../../../../model-registry/components/model-list/ModelListFilters';

export const PromptsListFilters = ({
  searchFilter,
  onSearchFilterChange,
  componentId,
}: {
  searchFilter: string;
  onSearchFilterChange: (searchFilter: string) => void;
  componentId: string;
}) => {
  const intl = useIntl();
  return (
    <TableFilterLayout>
      <TableFilterInput
        placeholder={intl.formatMessage({
          defaultMessage: 'Search prompts by name',
          description: 'Placeholder for filtering prompts by name',
        })}
        componentId={componentId}
        value={searchFilter}
        onChange={(e) => onSearchFilterChange(e.target.value)}
        suffix={<ModelSearchInputHelpTooltip exampleEntityName="my-prompt-name" />}
      />
    </TableFilterLayout>
  );
};
