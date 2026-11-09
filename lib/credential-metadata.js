import { createHash } from 'node:crypto'

export function fieldMetadata(field) {
  const value = String(field.value ?? '')
  return {
    label: field.label,
    present: value.length > 0,
    fingerprint: createHash('sha256').update(value).digest('hex').slice(0, 10),
  }
}

export function credentialMetadata(credential) {
  return {
    id: credential.id,
    name: credential.name,
    category: credential.category,
    fields: (credential.fields || []).map(fieldMetadata),
    updatedAt: credential.updatedAt,
  }
}

export function maskVault(data) {
  return {
    ...data,
    credentials: (data.credentials || []).map(credential => ({
      ...credential,
      fields: (credential.fields || []).map(field => {
        const value = String(field.value ?? '')
        return {
          ...fieldMetadata(field),
          sensitive: !!field.sensitive,
          // A short value must never be exposed in full by its suffix.
          value: '••••' + (value.length > 4 ? value.slice(-4) : ''),
        }
      }),
    })),
  }
}
