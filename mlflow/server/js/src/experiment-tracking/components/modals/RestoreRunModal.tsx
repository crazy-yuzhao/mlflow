/**
 * NOTE: this code file was automatically migrated to TypeScript using ts-migrate and
 * may contain multiple `any` type annotations and `@ts-expect-error` directives.
 * If possible, please improve types while making changes to this file. If the type
 * annotations are already looking good, please remove this comment.
 */

import React, { Component } from 'react';
import { ConfirmModal } from './ConfirmModal';
import { connect } from 'react-redux';
import { restoreRunApi } from '../../actions';
import Utils from '../../../common/utils/Utils';
import { FormattedMessage } from 'react-intl';

type Props = {
  isOpen: boolean;
  onClose: (...args: any[]) => any;
  selectedRunIds: string[];
  restoreRunApi: (...args: any[]) => any;
  onSuccess?: () => void;
};

export class RestoreRunModalImpl extends Component<Props> {
  constructor(props: Props) {
    super(props);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  handleSubmit() {
    const restorePromises: any = [];
    this.props.selectedRunIds.forEach((runId) => {
      restorePromises.push(this.props.restoreRunApi(runId));
    });
    return Promise.all(restorePromises)
      .catch((e) => {
        Utils.logErrorAndNotifyUser(e?.message || e);
      })
      .then(() => {
        this.props.onSuccess?.();
      });
  }

  render() {
    const number = this.props.selectedRunIds.length;
    return (
      <ConfirmModal
        isOpen={this.props.isOpen}
        onClose={this.props.onClose}
        handleSubmit={this.handleSubmit}
        title={
          <FormattedMessage
            defaultMessage="{count, plural, one {Restore Experiment Run} other {Restore Experiment Runs}}"
            description="Title of the modal for restoring deleted experiment runs"
            values={{ count: number }}
          />
        }
        helpText={
          <FormattedMessage
            defaultMessage="{count, plural, one {# experiment run will be restored.} other {# experiment runs will be restored.}}"
            description="Body of the modal for restoring deleted experiment runs"
            values={{ count: number }}
          />
        }
        confirmButtonText={
          <FormattedMessage
            defaultMessage="Restore"
            description="Confirm button for restoring deleted experiment runs"
          />
        }
      />
    );
  }
}

const mapDispatchToProps = {
  restoreRunApi,
};

export default connect(null, mapDispatchToProps)(RestoreRunModalImpl);
