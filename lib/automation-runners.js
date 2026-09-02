import { runFarringtonLeadSweep } from './apify-farrington-lead-sweep'
import { runCampaignPublishAutomation } from './campaign-publish-runner'
import { getPostizPublishReadiness } from './postiz-publish'
import { runRileyFollowUpWatchdog } from './riley-follow-up-runner'
import { runTwilioCommsPoll } from './twilio-comms-poll-runner'
import { runInboundDigest } from './inbound-digest-runner'

function matchesRunner(automation, id) {
  return automation?.templateId === id
    || automation?.runnerId === id
    || automation?.fulfillment?.handler === id
}

function isLeadSweepAutomation(automation) {
  if (!automation) return false
  const knownProof = automation.id === 'auto_plumber_leak_leads_daily_proof'
    || automation.id === 'auto_marge_wnc_plumber_lead_sweep'
  return matchesRunner(automation, 'lead-sweep-v1') || matchesRunner(automation, 'lead-sweep-v2') || knownProof
}

function isCampaignPublishAutomation(automation) {
  return matchesRunner(automation, 'campaign-publish-v1')
}

function isRileyFollowUpAutomation(automation) {
  return matchesRunner(automation, 'riley-follow-up-v1')
}

export function getAutomationRunner(automation) {
  if (matchesRunner(automation, 'twilio-comms-poll-v1')) {
    return {
      id: 'twilio-comms-poll-v1',
      label: 'Twilio Comms Capture v1 (read-only)',
      run: runTwilioCommsPoll,
    }
  }
  if (matchesRunner(automation, 'inbound-digest-v1')) {
    return {
      id: 'inbound-digest-v1',
      label: 'Inbound Unhandled Digest v1',
      run: runInboundDigest,
    }
  }
  if (isCampaignPublishAutomation(automation)) {
    return {
      id: 'campaign-publish-v1',
      label: 'Campaign Publish Automation v1',
      run: runCampaignPublishAutomation,
      readiness: getPostizPublishReadiness(),
    }
  }
  if (isLeadSweepAutomation(automation)) {
    return {
      id: 'lead-sweep-v1',
      label: 'Lead Sweep Automation v1',
      run: runFarringtonLeadSweep,
    }
  }
  if (isRileyFollowUpAutomation(automation)) {
    return {
      id: 'riley-follow-up-v1',
      label: 'Riley Follow-up Watchdog v1',
      run: runRileyFollowUpWatchdog,
    }
  }
  return null
}

export async function runRegisteredAutomation(automation, options = {}) {
  const runner = getAutomationRunner(automation)
  if (!runner) return null
  const result = await runner.run(automation, options)
  return {
    runnerId: runner.id,
    runnerLabel: runner.label,
    result,
  }
}
