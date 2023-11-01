// @flow

import type {IntlShape} from 'react-intl';
import type {RouterHistory} from 'react-router';
import type {RootState} from '../../../../../reducers/types';
import type {
  SeasonPeriodType,
  PlanType,
  CreateFormValuesType
} from '../../../../../reducers/projects/subscriptions/plans/types';

import React, {Fragment, PureComponent} from 'react';
import {compose} from 'redux';
import {connect} from 'react-redux';
import {withRouter} from 'react-router-dom';
import {injectIntl} from 'react-intl';
import {reduxForm, SubmissionError, change} from 'redux-form';
import Wizard from '../../../../../components/wizard';
import {xsollaAnalytics} from '../../../../../utils/xsolla-analytics/analytics-with-store';
import validator from '../../../../../validators/projects/subscriptions/plan';
import {connectStoreModule} from '../../../../../reducers/projects/projects';
import {initialValues} from '../../../../../forms/projects/subscriptions';
import {createSubscriptionsPlan} from '../../../../../reducers/projects/subscriptions/plans';
import {SUBSCRIPTIONS} from '../../../../../features/store/constants/modules';
import {General, Payment, Settings} from '../../../../../forms/projects/subscriptions/plans';
import {convertSubscriptionPlan} from '../../../../../forms/projects/subscriptions/converters';
import {selectFeatureByName, SUBS_MULTICURRENCY} from '../../../../../reducers/features';

type Props = {
  +featureToggle: boolean,
  +intl: IntlShape,
  +history: RouterHistory,
  +match: {
    params: {merchant_id: string, project_id: string}
  },
  +reset: () => void,
  +change: (name: string, value: boolean) => void,
  +localeList: Array<string>,
  +handleSubmit: (data: Object) => void,
  +createSubscriptionsPlan: (
    params: {merchant_id: string, project_id: string},
    values?: Object
  ) => Promise<string>,
  +onClose: () => void,
  +onSuccessHandler?: string => void,
  +isOpen: boolean,
  +submitting: boolean,
  +redirect?: boolean,
  +connectStoreModule: (params: Object, componentKey: string) => Promise<void>,
  +isSubscriptionsEnabled: boolean,
  +initialValues: PlanType
};

type State = {
  +seasonPeriodRange: {
    from: Date | null,
    to: Date | null
  }
};

const FORM_NAME = '@form/projects/subscriptions/plan/create';

class SubscriptionsPlanCreate extends PureComponent<Props, State> {
  static defaultProps = {
    submitting: false,
    redirect: true
  };

  state = {
    seasonPeriodRange: {
      from: null,
      to: null
    }
  };

  handleFormSubmit = async (values: CreateFormValuesType) => {
    const {
      featureToggle,
      match,
      createSubscriptionsPlan,
      onSuccessHandler,
      history,
      isSubscriptionsEnabled,
      connectStoreModule
    } = this.props;
    const data = convertSubscriptionPlan(values, featureToggle);
    if (!isSubscriptionsEnabled) {
      connectStoreModule(match.params, SUBSCRIPTIONS);
    }

    return createSubscriptionsPlan(match.params, data)
      .then(external_id => {
        history.push(
          `/${match.params.merchant_id}/projects/${match.params.project_id}/subscriptions/plans`
        );
        xsollaAnalytics.sendClick('subs_integration_funnel_plan-creation');
        if (onSuccessHandler) {
          onSuccessHandler(external_id);
        }
      })
      .catch(error => {
        throw new SubmissionError(error.response.data.extended_message.property_errors);
      });
  };

  steps = {
    info: General,
    payment: Payment,
    settings: Settings
  };

  get stepsArray() {
    const {intl} = this.props;
    const stepsObject = Object.keys(this.steps).map(step => ({
      component: this.steps[step],
      key: step,
      label: intl.messages[`app.plans.wizard.steps.${step}`]
    }));
    return stepsObject;
  }

  onSeasonPeriodChange = (range: SeasonPeriodType): void => {
    const {change} = this.props;
    this.setState({seasonPeriodRange: range});
    change('season_period', range);
  };

  render() {
    const {intl, localeList, handleSubmit, submitting, isOpen, initialValues, ...rest} = this.props;
    const {seasonPeriodRange} = this.state;
    if (initialValues.recurrent_bonus.comment === '') {
      initialValues.recurrent_bonus.comment =
        intl.messages['app.projects.subscriptions.plan.bonuses.comment-initial'];
    }

    return (
      <Fragment>
        <Wizard
          title={intl.messages['app.projects.subscriptions.plan.create']}
          handleSubmit={handleSubmit(this.handleFormSubmit)}
          steps={this.stepsArray}
          size="lg"
          formProps={rest}
          initialValues={initialValues}
          payload={{
            localesList: localeList,
            seasonPeriodRange: seasonPeriodRange,
            onSeasonPeriodChange: this.onSeasonPeriodChange
          }}
        />
      </Fragment>
    );
  }
}

const mapStateToProps = (state: RootState) => ({
  featureToggle: selectFeatureByName(state, SUBS_MULTICURRENCY)?.enabled,
  localeList: state.projects?.details ? state.projects?.details?.locale_list : ['en'],
  initialValues: initialValues(),
  projects: {
    isFetching: state.projects?.isFetching,
    details: state.projects?.details
  },
  isSubscriptionsEnabled: state.projects?.details?.components.subscriptions.enabled
});

const mapDispatchToProps = {
  createSubscriptionsPlan,
  connectStoreModule,
  change
};

const enhance = compose(
  withRouter,
  injectIntl,
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  reduxForm({
    form: FORM_NAME,
    validate: validator.errors,
    warn: validator.warns,
    onSubmitFail: validator.scrollToErrors
  })
);

export default enhance(SubscriptionsPlanCreate);
