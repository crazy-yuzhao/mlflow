/**
 * NOTE: this code file was automatically migrated to TypeScript using ts-migrate and
 * may contain multiple `any` type annotations and `@ts-expect-error` directives.
 * If possible, please improve types while making changes to this file. If the type
 * annotations are already looking good, please remove this comment.
 */

import React, { Component } from 'react';
import { ConfirmModal } from './ConfirmModal';
import { deleteExperimentApi } from '../../actions';
import Routes from '../../routes';
import Utils from '../../../common/utils/Utils';
import { connect } from 'react-redux';
import type { NavigateFunction } from '../../../common/utils/RoutingUtils';
import { getUUID } from '../../../common/utils/ActionUtils';
import { withRouterNext } from '../../../common/utils/withRouterNext';
import { FormattedMessage } from 'react-intl';

type Props = {
  isOpen: boolean;
  onClose: (...args: any[]) => any;
  activeExperimentIds?: string[];
  experimentId: string;
  experimentName: string;
  deleteExperimentApi: (...args: any[]) => any;
  onExperimentDeleted: () => void;
  navigate: NavigateFunction;
};

export class DeleteExperimentModalImpl extends Component<Props> {
  handleSubmit = () => {
    const { experimentId, activeExperimentIds } = this.props;
    const deleteExperimentRequestId = getUUID();

    const deletePromise = this.props
      .deleteExperimentApi(experimentId, deleteExperimentRequestId)
      .then(() => {
        // reload the page if an active experiment was deleted
        if (activeExperimentIds?.includes(experimentId)) {
          if (activeExperimentIds.length === 1) {
            // send it to root
            this.props.navigate(Routes.rootRoute);
          } else {
            const experimentIds = activeExperimentIds.filter((eid) => eid !== experimentId);
            const route =
              experimentIds.length === 1
                ? Routes.getExperimentPageRoute(experimentIds[0])
                : Routes.getCompareExperimentsPageRoute(experimentIds);
            this.props.navigate(route);
          }
        }
      })
      .then(() => this.props.onExperimentDeleted())
      .catch((e: any) => {
        Utils.logErrorAndNotifyUser(e);
      });

    return deletePromise;
  };

  render() {
    return (
      <ConfirmModal
        isOpen={this.props.isOpen}
        onClose={this.props.onClose}
        handleSubmit={this.handleSubmit}
        title={
          <FormattedMessage
            defaultMessage='Delete Experiment "{experimentName}"'
            description="Title of the modal for deleting one experiment"
            values={{ experimentName: this.props.experimentName }}
          />
        }
        helpText={
          <div>
            <p>
              <b>
                <FormattedMessage
                  defaultMessage='Experiment "{experimentName}" (Experiment ID: {experimentId}) will be deleted.'
                  description="Confirmation text in the delete experiment modal"
                  values={{
                    experimentName: this.props.experimentName,
                    experimentId: this.props.experimentId,
                  }}
                />
              </b>
            </p>
            {/* @ts-expect-error TS(4111): Property 'MLFLOW_SHOW_GDPR_PURGING_MESSAGES' comes from a... Remove this comment to see the full error message */}
            {process.env.MLFLOW_SHOW_GDPR_PURGING_MESSAGES === 'true' ? (
              <p>
                <FormattedMessage
                  defaultMessage="Deleted experiments are restorable for 30 days, after which they are purged along with their associated runs, including metrics, params, tags, and artifacts."
                  description="GDPR notice in the delete experiment modal"
                />
              </p>
            ) : (
              ''
            )}
          </div>
        }
        confirmButtonText={
          <FormattedMessage defaultMessage="Delete" description="Confirm button for deleting an experiment" />
        }
      />
    );
  }
}

const mapDispatchToProps = {
  deleteExperimentApi,
};

export const DeleteExperimentModal = withRouterNext(connect(undefined, mapDispatchToProps)(DeleteExperimentModalImpl));
