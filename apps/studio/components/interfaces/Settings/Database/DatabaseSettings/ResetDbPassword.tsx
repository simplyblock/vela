import { debounce } from 'lodash'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useParams } from 'common'
import { useIsProjectActive } from 'components/layouts/ProjectLayout/ProjectContext'
import { ButtonTooltip } from 'components/ui/ButtonTooltip'
import Panel from 'components/ui/Panel'
import PasswordStrengthBar from 'components/ui/PasswordStrengthBar'
import { useDatabasePasswordResetMutation } from 'data/database/database-password-reset-mutation'
import { DEFAULT_MINIMUM_PASSWORD_STRENGTH } from 'lib/constants'
import passwordStrength from 'lib/password-strength'
import { generateStrongPassword } from 'lib/project'
import { Button, Input, Modal } from 'ui'
import { useCheckPermissions } from 'hooks/misc/useCheckPermissions'
import { SpecialSymbolsCallout } from '../../../ProjectCreation/SpecialSymbolsCallout'
import { SPECIAL_CHARS_REGEX } from '../../../ProjectCreation/ProjectCreation.constants'

const ResetDbPassword = ({ disabled = false }) => {
  const { slug, ref, branch } = useParams()
  const isProjectActive = useIsProjectActive()
  const { can: canResetDbPassword } = useCheckPermissions("branch:db:admin")

  const [showResetDbPass, setShowResetDbPass] = useState<boolean>(false)

  const [password, setPassword] = useState<string>('')
  const [passwordStrengthMessage, setPasswordStrengthMessage] = useState<string>('')
  const [passwordStrengthWarning, setPasswordStrengthWarning] = useState<string>('')
  const [passwordStrengthScore, setPasswordStrengthScore] = useState<number>(0)
  const [hasSpecialCharacters, setHasSpecialCharacters] = useState<boolean>(false)

  const { mutate: resetDatabasePassword, isLoading: isUpdatingPassword } =
    useDatabasePasswordResetMutation({
      onSuccess: async () => {
        toast.success('Successfully updated database password')
        setShowResetDbPass(false)
      },
    })

  useEffect(() => {
    if (showResetDbPass) {
      setPassword('')
      setPasswordStrengthMessage('')
      setPasswordStrengthWarning('')
      setPasswordStrengthScore(0)
      setHasSpecialCharacters(false)
    }
  }, [showResetDbPass])

  async function checkPasswordStrength(value: any) {
    const { message, warning, strength } = await passwordStrength(value)
    setPasswordStrengthScore(strength)
    setPasswordStrengthWarning(warning)
    setPasswordStrengthMessage(message)
  }

  const delayedCheckPassword = useRef(
    debounce(async (value) => {
      await checkPasswordStrength(value)
      setHasSpecialCharacters(value.length > 0 && !value.match(SPECIAL_CHARS_REGEX))
    }, 300)
  ).current

  const onDbPassChange = (e: any) => {
    const value = e.target.value
    setPassword(value)
    if (value == '') {
      setPasswordStrengthScore(-1)
      setPasswordStrengthMessage('')
    } else delayedCheckPassword(value)
  }

  const confirmResetDbPass = async () => {
    if (!slug) return console.error('Organization ref is required')
    if (!ref) return console.error('Project ref is required')
    if (!branch) return console.error('Branch ref is required')

    if (passwordStrengthScore >= DEFAULT_MINIMUM_PASSWORD_STRENGTH) {
      resetDatabasePassword({ slug, ref, branch, password })
    }
  }

  function generatePassword() {
    const password = generateStrongPassword()
    setPassword(password)
    delayedCheckPassword(password)
  }

  return (
    <>
      <Panel className="!m-0">
        <Panel.Content>
          <div
            className="grid grid-cols-1 items-center lg:grid-cols-3 scroll-mt-6"
            id="database-password"
          >
            <div className="col-span-2 space-y-1">
              <p className="block">Database password</p>
              <p className="text-sm opacity-50">
                You can use this password to connect directly to your Postgres database.
              </p>
            </div>
            <div className="flex items-end justify-end">
              <ButtonTooltip
                type="default"
                disabled={!canResetDbPassword || !isProjectActive || disabled}
                onClick={() => setShowResetDbPass(true)}
                tooltip={{
                  content: {
                    side: 'bottom',
                    text: !canResetDbPassword
                      ? 'You need additional permissions to reset the database password'
                      : !isProjectActive
                        ? 'Unable to reset database password as project is not active'
                        : undefined,
                  },
                }}
              >
                Reset database password
              </ButtonTooltip>
            </div>
          </div>
        </Panel.Content>
      </Panel>
      <Modal
        hideFooter
        header={<h5 className="text-foreground">Reset database password</h5>}
        confirmText="Reset password"
        size="medium"
        visible={showResetDbPass}
        loading={isUpdatingPassword}
        onCancel={() => setShowResetDbPass(false)}
      >
        <Modal.Content className="w-full space-y-8">
          {hasSpecialCharacters && <SpecialSymbolsCallout />}
          <Input
            type="password"
            value={password}
            copy={password.length > 0}
            onChange={onDbPassChange}
            error={passwordStrengthWarning}
            // @ts-ignore
            descriptionText={
              <PasswordStrengthBar
                passwordStrengthScore={passwordStrengthScore}
                passwordStrengthMessage={passwordStrengthMessage}
                password={password}
                generateStrongPassword={generatePassword}
              />
            }
          />
        </Modal.Content>
        <Modal.Separator />
        <Modal.Content className="flex items-center justify-end space-x-2">
          <Button
            type="default"
            disabled={isUpdatingPassword}
            onClick={() => setShowResetDbPass(false)}
          >
            Cancel
          </Button>
          <Button
            type="primary"
            loading={isUpdatingPassword}
            disabled={isUpdatingPassword}
            onClick={() => confirmResetDbPass()}
          >
            Reset password
          </Button>
        </Modal.Content>
      </Modal>
    </>
  )
}

export default ResetDbPassword
