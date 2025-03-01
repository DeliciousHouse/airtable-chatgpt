import React, {useState} from "react";
import {globalConfig} from "@airtable/blocks";
import {
    Box,
    Button,
    FieldPickerSynced,
    Heading,
    InputSynced,
    ProgressBar,
    useGlobalConfig,
    Text,
    useRecords, SelectSynced
} from "@airtable/blocks/ui";

import {Configuration, OpenAIApi} from 'openai';

const DAVINCI = 'text-davinci-003'

async function askOpenAi(prompt) {
    const configuration = new Configuration({apiKey: globalConfig.get('apiKey')});
    const openai = new OpenAIApi(configuration);
    const opts = {
        model: globalConfig.get("model") || DAVINCI,
        prompt: prompt,
        max_tokens: globalConfig.get("maxTokens") || 1504,
        temperature: globalConfig.get("temperature") || 0.3,
    }
    try {
        const response = await openai.createCompletion(opts)
        console.dir(response)
        return response.data.choices[0].text.trim()
        // eslint-disable-next-line no-empty
    } catch(e) {
        return e.message
    }
}

function SettingsInput({name, label}) {
    return (<Box paddingY="2">
        <Heading size="small" paddingBottom="1">{name}</Heading>
        <InputSynced globalConfigKey={name} placeholder={label} width="100%"/>
    </Box>)
}

export const globalOptions = {apiKey: 'sk-...{48 alphanumeric symbols}...'}

export function SettingsContainer() {
    const options = Object.keys(globalOptions).map((k) => {
        return <SettingsInput key={k} name={k} label={globalOptions[k]}/>
    })
    return <Box padding="3">{options}</Box>
}

export async function processRecords(table, records, totalRecords, setProgressBarProgress, setProgressText, setInProgress) {
    setProgressBarProgress(0)
    setInProgress(true)
    let i = 0, MAX_RECORDS_PER_GET = 25
    while (totalRecords && i < totalRecords) {
        const batchSize = MAX_RECORDS_PER_GET
        let batchRecords = records.slice(i, i + batchSize)
        let recs = await Promise.all(
            batchRecords.map(async (record) => {
                return {
                    id: record.id,
                    fields: {[globalConfig.get('fieldTo')]: await askOpenAi(record.getCellValueAsString(globalConfig.get('fieldFrom')))}
                }
            }))
        console.dir(recs)
        await table.updateRecordsAsync(recs)
        let v = i + batchRecords.length
        i += batchSize;
        let p = v / totalRecords
        setProgressBarProgress(p)
        setProgressText(`${v} of ${totalRecords} (${parseInt(p * 100)}%)`)

    }
    setInProgress(false)
}

export function MainContainer({table, view}) {
    const globalConfig = useGlobalConfig();
    let [progressBarProgress, setProgressBarProgress] = useState(0)
    let [progressText, setProgressText] = useState('in progress...')
    let [inProgress, setInProgress] = useState(false)
    let fieldFrom = table.getFieldByIdIfExists(globalConfig.get('fieldFrom'))
    let fieldTo = table.getFieldByIdIfExists(globalConfig.get('fieldTo'))
    let setupWarning = !fieldFrom || !fieldTo || !globalConfig.get("model") || !globalConfig.get("maxTokens") || !globalConfig.get("temperature")
    let apiKeyWarning = !globalConfig.get("apiKey")

    let records = useRecords(view)

    let totalRecords = records && records.length;

    const models = ['text-davinci-003', 'text-curie-001', 'text-babbage-001', 'text-ada-001'].map((i) => {
        return {label: i, value: i}
    })
    const totalTokenOpts = globalConfig.get("model") === DAVINCI ? 126 : 65, totalTempOpts = 21
    const tokens = [...Array(totalTokenOpts).keys()].map((i) => {
        const v = (globalConfig.get("model") === DAVINCI ? 4000 : 2048) * i / (totalTokenOpts - 1)
        return {label: v, value: v}
    })
    const temps = [...Array(totalTempOpts).keys()].map((i) => {
        const v = 2.0 * i / (totalTempOpts - 1)
        return {label: v, value: v}
    })

    return (
        <Box padding="3">
            <Box marginBottom="3" borderBottom="thick">
                <Heading size="small">
                    <Text textColor="light" as="span"> Table: </Text> {table.name}
                    <Text textColor="darkred" as="span"> › </Text>
                    <Text textColor="light" as="span"> View: </Text> {view.name}
                </Heading>
            </Box>
            <Box paddingBottom="3">
                <Heading size="xsmall" textColor="light"> Model </Heading>
                <SelectSynced options={models} globalConfigKey="model" placeholder="Max Tokens" width="100%"/>
            </Box>
            <Box paddingBottom="3" display="flex">
                <Box width="49%">
                    <Heading size="xsmall" textColor="light"> Max Tokens </Heading>
                    <SelectSynced options={tokens} globalConfigKey="maxTokens" placeholder="Max Tokens"/>
                </Box>
                <Box width="49%" marginLeft="2%">
                    <Heading size="xsmall" textColor="light"> Temperature </Heading>
                    <SelectSynced options={temps} globalConfigKey="temperature" placeholder="Temperature"/>
                </Box>
            </Box>
            <Box paddingBottom="3" display="flex">
                <Box width="49%">
                    <Heading size="xsmall" textColor="light">Prompt</Heading>
                    <FieldPickerSynced table={table} globalConfigKey="fieldFrom"/>
                </Box>
                <Box width="49%" marginLeft="2%">
                    <Heading size="xsmall" textColor="light">Save To</Heading>
                    <FieldPickerSynced table={table} globalConfigKey="fieldTo"
                                       allowedTypes={['number', 'singleLineText', 'multilineText', 'richText']}/>
                </Box>
            </Box>
            <Box position={"fixed"} bottom={3} width={'100%'} display={'flex'}>
                <Button disabled={inProgress || !totalRecords || setupWarning || apiKeyWarning}
                        size="large"
                        width={'calc(100% - 32px)'}
                        icon={inProgress ? "overflow" : (setupWarning || apiKeyWarning ? "warning" : "paragraph")}
                        variant={inProgress ? "default" : "primary"}
                        onClick={() => processRecords(table, records, totalRecords, setProgressBarProgress, setProgressText, setInProgress)}>
                    {inProgress
                        ?
                        <Box><Text>{progressText}</Text><ProgressBar progress={progressBarProgress}
                                                                     barColor='#ff9900'/></Box>
                        : (apiKeyWarning ? 'Set up apiKey in Settings' : (setupWarning ? 'Set up all params' : `Process ${totalRecords || 'NaN'} record${totalRecords && totalRecords > 1 ? 's' : ''}`))
                    }
                </Button>
            </Box>
        </Box>
    );
}
